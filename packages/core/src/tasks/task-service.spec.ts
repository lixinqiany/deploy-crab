import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CreateTaskInput,
  emptyTaskHooks,
  type CreateTaskBody,
  type Task,
} from '@deploy-crab/contracts/task';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Database, DATABASE_FILENAME } from '../database/database';
import { TaskService } from './task-service';
import { HostRepository } from '../inventory/host-repository';
import { CreateHostInput } from '@deploy-crab/contracts/host';

const body = (
  name = 'task',
  overrides: Partial<CreateTaskBody> = {},
): CreateTaskInput =>
  CreateTaskInput.parse({
    name,
    definition: {
      steps: [
        {
          id: 'check',
          title: '检查连接',
          call: { kind: 'action', action: 'ssh.probe' },
        },
      ],
    },
    ...overrides,
  });
const reference = (name: string, taskId: string): CreateTaskInput =>
  body(name, {
    definition: {
      steps: [
        { id: 'child', title: '引用任务', call: { kind: 'task', taskId } },
      ],
    },
  });
const update = (task: Task): CreateTaskInput & { revision: number } => ({
  name: task.name,
  description: task.description,
  labels: task.labels,
  sourceUrl: task.sourceUrl,
  definition: task.definition,
  revision: task.revision,
});

describe('TaskService', () => {
  let root: string, database: Database, service: TaskService;
  const migrations = fileURLToPath(
    new URL('../../migrations/', import.meta.url),
  );
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'deploy-crab-tasks-'));
    database = new Database(join(root, DATABASE_FILENAME), migrations);
    service = new TaskService(database);
  });
  afterEach(async () => {
    database.close();
    await rm(root, { recursive: true, force: true });
  });

  const migrationsThrough = async (index: number) => {
    const directory = join(root, `migrations-through-${index}`);
    await mkdir(join(directory, 'meta'), { recursive: true });
    const journal = JSON.parse(
      await readFile(join(migrations, 'meta/_journal.json'), 'utf8'),
    ) as { entries: { idx: number; tag: string }[] };
    journal.entries = journal.entries.filter((entry) => entry.idx <= index);
    await writeFile(
      join(directory, 'meta/_journal.json'),
      JSON.stringify(journal),
    );
    for (const { tag } of journal.entries) {
      await copyFile(
        join(migrations, `${tag}.sql`),
        join(directory, `${tag}.sql`),
      );
    }
    return directory;
  };

  it('保存纯定义、升级版本，关闭数据库后仍可读取', () => {
    const task = service.create(body('task', { labels: ['部署', '巡检'] }));
    const saved = service.update(task.id, {
      ...update(task),
      description: '修改后的说明',
      labels: ['生产'],
    });
    expect(saved.revision).toBe(2);
    expect(saved.labels).toEqual(['生产']);
    expect(saved.createdAt).toBe(task.createdAt);
    database.close();
    database = new Database(join(root, DATABASE_FILENAME), migrations);
    service = new TaskService(database);
    expect(service.get(task.id)).toEqual(saved);
    expect(service.list()).toEqual([saved]);
    service.delete(task.id);
    expect(service.list()).toEqual([]);
  });

  it('从仅有资产表的旧数据库升级，保留原有主机资料', async () => {
    const oldMigrations = await migrationsThrough(0);
    const path = join(root, 'legacy.sqlite');
    const legacy = new Database(path, oldMigrations);
    const host = {
      ...CreateHostInput.parse({
        name: 'existing-host',
        publicAddress: '192.0.2.10',
        user: 'deploy',
      }),
      id: '00000000-0000-4000-8000-000000000001',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      legacy.write((tx) => new HostRepository(tx).insert(host));
    } finally {
      legacy.close();
    }
    const upgraded = new Database(path, migrations);
    try {
      expect(
        upgraded.read((tx) => new HostRepository(tx).get(host.id)),
      ).toEqual(host);
      expect(
        new TaskService(upgraded).create(body('after-upgrade')).revision,
      ).toBe(1);
    } finally {
      upgraded.close();
    }
  });

  it('拒绝重复名称和过期版本，失败不覆盖数据', () => {
    const task = service.create(body('部署'));
    expect(() => service.create(body(' 部署 '))).toThrow('已被其他任务使用');
    const saved = service.update(task.id, {
      ...update(task),
      name: '新的部署',
    });
    expect(() => service.update(task.id, update(task))).toThrow('其他窗口更新');
    expect(service.get(task.id)).toEqual(saved);
  });

  it('拒绝缺失引用、自引用以及跨任务循环，写入保持原子性', () => {
    expect(() =>
      service.create(
        reference('missing', '00000000-0000-4000-8000-000000000000'),
      ),
    ).toThrow('不存在');
    const a = service.create(body('A'));
    const b = service.create(reference('B', a.id));
    const c = service.create(reference('C', b.id));
    expect(() =>
      service.update(a.id, { ...reference('A', a.id), revision: 1 }),
    ).toThrow('自己');
    expect(() =>
      service.update(a.id, { ...reference('A', c.id), revision: 1 }),
    ).toThrow('循环');
    expect(service.get(a.id)).toEqual(a);
    expect(service.list()).toHaveLength(3);
  });

  it('任务与步骤钩子中的引用同样参与循环检查和删除保护', () => {
    const target = service.create(body('child'));
    for (const position of ['task', 'step'] as const) {
      const input = body(position);
      const hooks = {
        ...emptyTaskHooks(),
        finally: [
          {
            key: 'cleanup',
            title: '收尾',
            call: { kind: 'task' as const, taskId: target.id },
            timeoutMs: 5000,
          },
        ],
      };
      if (position === 'task') input.definition.hooks = hooks;
      else input.definition.steps[0]!.hooks = hooks;
      const parent = service.create(input);
      expect(() => service.delete(target.id)).toThrow('引用');
      expect(() =>
        service.update(target.id, {
          ...reference('child', parent.id),
          revision: target.revision,
        }),
      ).toThrow('循环');
      service.update(parent.id, {
        ...body(position),
        revision: parent.revision,
      });
      service.delete(parent.id);
    }
    service.delete(target.id);
    expect(service.list()).toEqual([]);
  });

  it('数据契约拒绝未知能力、空脚本和错误依赖，同时支持并行分支', () => {
    const probe = { kind: 'action', action: 'ssh.probe' };
    const parse = (steps: unknown) =>
      CreateTaskInput.safeParse({ name: 'validate', definition: { steps } });
    expect(
      parse([
        { id: 'a', title: 'a', call: { kind: 'action', action: 'unknown' } },
      ]).success,
    ).toBe(false);
    const emptyScript = parse([
      {
        id: 'a',
        title: 'a',
        call: { kind: 'action', action: 'ssh.exec', input: { script: '   ' } },
      },
    ]);
    expect(emptyScript.success).toBe(false);
    if (!emptyScript.success)
      expect(emptyScript.error.issues[0]?.message).toBe('请填写脚本');
    expect(
      parse([{ id: 'a', title: 'a', call: probe, dependsOn: ['missing'] }])
        .success,
    ).toBe(false);
    expect(
      parse([
        { id: 'a', title: 'a', call: probe },
        { id: 'a', title: 'b', call: probe },
      ]).success,
    ).toBe(false);
    expect(
      parse([
        { id: 'a', title: 'a', call: probe, dependsOn: ['b'] },
        { id: 'b', title: 'b', call: probe, dependsOn: ['a'] },
      ]).success,
    ).toBe(false);
    expect(
      parse([
        { id: 'a', title: 'a', call: probe },
        { id: 'b', title: 'b', call: probe },
        { id: 'c', title: 'c', call: probe, dependsOn: ['a', 'b'] },
      ]).success,
    ).toBe(true);
  });

  it('独立任务可声明必填字段；引用时校验步骤与两层钩子，默认值不写入调用处', () => {
    const child = service.create(
      body('带参数的任务', {
        definition: {
          ...body().definition,
          parameters: [
            { name: 'url', required: true },
            { name: 'enabled', type: 'boolean', defaultValue: false },
          ],
        },
      }),
    );
    expect(child.definition.parameters[0]?.required).toBe(true);
    expect(() => service.create(reference('缺少参数', child.id))).toThrow(
      '必填参数',
    );
    for (const position of ['step', 'task-hook', 'step-hook'] as const) {
      const input = body(position);
      const call = {
        kind: 'task' as const,
        taskId: child.id,
        input: { url: 'https://example.test' },
      };
      if (position === 'step') input.definition.steps[0]!.call = call;
      else
        (position === 'task-hook'
          ? input.definition.hooks
          : input.definition.steps[0]!.hooks
        ).finally.push({
          key: 'cleanup',
          title: '收尾',
          call,
          timeoutMs: 5000,
        });
      const owner = service.create(input);
      const savedCalls = [
        owner.definition.steps[0]!.call,
        ...owner.definition.hooks.finally.map((h) => h.call),
        ...owner.definition.steps[0]!.hooks.finally.map((h) => h.call),
      ];
      expect(savedCalls.find((c) => c.kind === 'task')).toEqual(call);
      call.input.url = '';
      expect(() =>
        service.update(owner.id, { ...input, revision: owner.revision }),
      ).toThrow('不能为空');
    }
  });

  it('修改子任务参数不能使已有引用失效，失败时参数定义保持不变', () => {
    const child = service.create(
      body('child', {
        definition: { ...body().definition, parameters: [{ name: 'url' }] },
      }),
    );
    const input = reference('parent', child.id);
    input.definition.steps[0]!.call = {
      kind: 'task',
      taskId: child.id,
      input: { url: 'https://example.test' },
    };
    service.create(input);
    for (const parameters of [
      [{ name: 'url', type: 'number' as const }],
      [{ name: 'changed' }],
      [{ name: 'url' }, { name: 'token', required: true }],
    ]) {
      const modified = body('child', {
        definition: { ...child.definition, parameters },
      });
      expect(() =>
        service.update(child.id, { ...modified, revision: child.revision }),
      ).toThrow('parent');
      expect(service.get(child.id)).toEqual(child);
    }
  });
});
