import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { Task } from '@deploy-crab/contracts/task';
import { configureTask } from '@deploy-crab/contracts/task-configuration';
import { SshScriptInput } from '@deploy-crab/contracts/ssh-script';
import {
  TaskParameters,
  resolveTaskInput,
} from '@deploy-crab/contracts/task-input';
import { ActionRegistry } from '../execution/action-registry';
import { ExecutionService } from '../execution/execution-service';
import { MemoryRunStore } from '../execution/run-store';
import {
  compileOrchestratedTask,
  type TaskHostTarget,
} from './stored-task-planner';
import { createMongoTasks } from './bundles/mongodb';
import {
  mongoInitialize,
  mongoUsers,
  mongoPrimary,
} from './bundles/mongodb-scripts';
import type { ActionContext } from '../execution/definition';

const script = (name: string) => ({
  kind: 'action',
  action: 'ssh.exec',
  input: { script: name },
});
const hosts = (count = 3): TaskHostTarget[] =>
  Array.from({ length: count }, (_, index) => {
    const hostId = randomUUID();
    return {
      hostId,
      name: `mongo-${index}`,
      target: {
        hostId,
        endpoint: {
          address: `mongo-${index}.test`,
          port: 22,
          user: 'root',
          auth: { method: 'agent' },
        },
        jumps: [],
      },
    };
  });
const task = (steps: unknown[]) =>
  Task.parse({
    id: randomUUID(),
    name: 'cluster',
    definition: { execution: 'orchestrated', steps },
    revision: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
const done = async (engine: ExecutionService, id: string) => {
  await expect.poll(() => engine.get(id).status).not.toMatch(/queued|running/);
  return engine.get(id);
};
const pythonBody = (script: string) =>
  script.split("python3 - <<'PY'\n")[1]!.split('\nPY')[0]!;
const javascriptBody = (script: string) => {
  const parsed = spawnSync(
    'python3',
    [
      '-c',
      'import ast,json,sys; tree=ast.parse(sys.stdin.read()); print(json.dumps(next(n.args[0].value for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=="run_js")))',
    ],
    { input: pythonBody(script), encoding: 'utf8' },
  );
  if (parsed.status !== 0) throw new Error(parsed.stderr);
  const source: unknown = JSON.parse(parsed.stdout);
  if (typeof source !== 'string') throw new Error('没有找到 mongosh 脚本');
  return source;
};

describe('跨主机任务编排', () => {
  it('并行步骤等待所有主机完成，再在一台主机执行后续步骤；并发为 1 也不会死锁', async () => {
    for (const concurrency of [1, 4]) {
      const targets = hosts(),
        seen: string[] = [];
      const definition = task([
        { id: 'prepare', title: 'prepare', call: script('prepare') },
        {
          id: 'init',
          title: 'init',
          call: script('init'),
          dependsOn: ['prepare'],
          placement: { kind: 'first' },
        },
      ]);
      const engine = new ExecutionService(
        new ActionRegistry().register({
          key: 'ssh.exec',
          execute: async (input, context) => {
            const name = SshScriptInput.parse(input).script;
            if (name === 'init') expect(seen).toHaveLength(3);
            await new Promise((resolve) => setTimeout(resolve, 5));
            seen.push(name + ':' + context.executionContext?.target?.id);
            return { name };
          },
        }),
        new MemoryRunStore(),
        concurrency,
      );
      try {
        const compiled = compileOrchestratedTask(
          configureTask(definition, []).configured,
          targets,
          {},
          'test',
        );
        const root = engine.submit(compiled.plan, { input: compiled.input });
        const completed = await done(engine, root.id);
        expect(completed.status).toBe('succeeded');
        expect(seen).toHaveLength(4);
        expect(seen.at(-1)).toBe('init:' + targets[0]!.hostId);
        expect(completed.steps[0]!.result).toEqual(
          Object.fromEntries(
            targets.map((target) => [target.hostId, { name: 'prepare' }]),
          ),
        );
        expect(completed.steps[1]!.result).toEqual({ name: 'init' });
      } finally {
        await engine.close();
      }
    }
  });
  it('任一节点失败会阻塞初始化，保留其他节点结果', async () => {
    const targets = hosts(),
      seen: string[] = [];
    const definition = task([
      { id: 'prepare', title: 'prepare', call: script('prepare') },
      {
        id: 'init',
        title: 'init',
        call: script('init'),
        dependsOn: ['prepare'],
        placement: { kind: 'first' },
      },
    ]);
    const engine = new ExecutionService(
      new ActionRegistry().register({
        key: 'ssh.exec',
        execute: (input, context) => {
          seen.push(SshScriptInput.parse(input).script);
          if (context.executionContext?.target?.id === targets[1]!.hostId)
            throw new Error('node failed');
          return Promise.resolve(null);
        },
      }),
      new MemoryRunStore(),
    );
    try {
      const compiled = compileOrchestratedTask(
        configureTask(definition, []).configured,
        targets,
        {},
        'test',
      );
      const completed = await done(engine, engine.submit(compiled.plan).id);
      expect(completed.status).toBe('failed');
      expect(completed.steps[1]!.status).toBe('blocked');
      expect(seen).toEqual(['prepare', 'prepare', 'prepare']);
    } finally {
      await engine.close();
    }
  });
  it('动态目标必须在冻结名单中，不能借助脚本返回值执行未选中的主机', async () => {
    const definition = task([
      {
        id: 'discover',
        title: 'discover',
        call: script('discover'),
        placement: { kind: 'first' },
      },
      {
        id: 'configure',
        title: 'configure',
        call: script('configure'),
        dependsOn: ['discover'],
        placement: { kind: 'result', stepId: 'discover', path: ['hostId'] },
      },
    ]);
    const seen: string[] = [];
    const engine = new ExecutionService(
      new ActionRegistry().register({
        key: 'ssh.exec',
        execute: (input) => {
          seen.push(SshScriptInput.parse(input).script);
          return Promise.resolve({ hostId: randomUUID() });
        },
      }),
      new MemoryRunStore(),
    );
    try {
      const compiled = compileOrchestratedTask(
        configureTask(definition, []).configured,
        hosts(),
        {},
        'test',
      );
      const completed = await done(engine, engine.submit(compiled.plan).id);
      expect(completed.status).toBe('failed');
      expect(seen).toEqual(['discover']);
      expect(completed.steps[1]!.errors[0]!.code).toBe('invalid_target');
    } finally {
      await engine.close();
    }
  });
  it('取消根任务终止各主机子执行', async () => {
    const targets = hosts(),
      active: ActionContext[] = [];
    const definition = task([
      { id: 'wait', title: 'wait', call: script('wait') },
    ]);
    const engine = new ExecutionService(
      new ActionRegistry().register({
        key: 'ssh.exec',
        execute: async (_, context) => {
          active.push(context);
          await new Promise<void>((resolve) =>
            context.signal.addEventListener('abort', () => resolve(), {
              once: true,
            }),
          );
          return null;
        },
      }),
      new MemoryRunStore(),
    );
    try {
      const compiled = compileOrchestratedTask(
        configureTask(definition, []).configured,
        targets,
        {},
        'test',
      );
      const run = engine.submit(compiled.plan);
      await expect.poll(() => active.length).toBe(3);
      engine.cancel(run.id);
      expect((await done(engine, run.id)).status).toBe('cancelled');
      expect(active.every((context) => context.signal.aborted)).toBe(true);
    } finally {
      await engine.close();
    }
  });
  it('前置结果和目标上下文在执行时传入子任务，保留 false 值', async () => {
    const targets = hosts(2);
    const child = Task.parse({
      ...task([{ id: 'consume', title: 'consume', call: script('consume') }]),
      definition: {
        parameters: [
          { name: 'enabled', type: 'boolean', required: true },
          { name: 'members', type: 'json', required: true },
        ],
        steps: [{ id: 'consume', title: 'consume', call: script('consume') }],
      },
    });
    const root = task([
      {
        id: 'discover',
        title: 'discover',
        placement: { kind: 'first' },
        call: script('discover'),
      },
      {
        id: 'consume',
        title: 'consume',
        dependsOn: ['discover'],
        call: {
          kind: 'task',
          taskId: child.id,
          inputBindings: {
            enabled: {
              from: 'stepResult',
              stepId: 'discover',
              path: ['enabled'],
            },
            members: { from: 'context', key: 'targets' },
          },
        },
      },
    ]);
    const seen: string[] = [];
    const engine = new ExecutionService(
      new ActionRegistry().register({
        key: 'ssh.exec',
        execute: (raw, context) => {
          if (SshScriptInput.parse(raw).script === 'discover')
            return Promise.resolve({ enabled: false });
          expect(context.taskInput.enabled).toBe(false);
          expect(context.taskInput.members).toEqual(
            targets.map((host) => ({
              id: host.hostId,
              name: host.name,
              address: host.target.endpoint.address,
            })),
          );
          seen.push(context.executionContext!.target!.id);
          return Promise.resolve(null);
        },
      }),
      new MemoryRunStore(),
      1,
    );
    try {
      const compiled = compileOrchestratedTask(
        configureTask(root, [child]).configured,
        targets,
        {},
        'test',
      );
      expect((await done(engine, engine.submit(compiled.plan).id)).status).toBe(
        'succeeded',
      );
      expect(seen).toEqual(targets.map((host) => host.hostId));
    } finally {
      await engine.close();
    }
  });
  it('MongoDB 任务组单节点和三节点都使用同一流程，账户在识别出的 Primary 上执行', async () => {
    for (const count of [1, 3]) {
      const definitions = createMongoTasks().map(({ id, body }) =>
        Task.parse({
          ...body,
          id,
          revision: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      );
      const root = definitions.at(-1)!,
        targets = hosts(count),
        primary = targets.at(-1)!;
      const input = {
        mongoVersion: '9.0',
        members: targets.map((host) => ({
          hostId: host.hostId,
          hostname: host.name + '.test',
          port: 27017,
        })),
        clusterKey: randomUUID(),
        adminPassword: randomUUID(),
      };
      const calls: { script: string; host: string | undefined }[] = [];
      const engine = new ExecutionService(
        new ActionRegistry().register({
          key: 'ssh.exec',
          execute: (raw, context) => {
            const script = SshScriptInput.parse(raw).script;
            calls.push({ script, host: context.executionContext?.target?.id });
            if (script === mongoInitialize || script === mongoPrimary)
              return Promise.resolve({ primaryHostId: primary.hostId });
            return Promise.resolve({ ok: true });
          },
        }),
        new MemoryRunStore(),
        1,
      );
      try {
        const compiled = compileOrchestratedTask(
          configureTask(root, definitions).configured,
          targets,
          input,
          'replica set',
        );
        const completed = await done(
          engine,
          engine.submit(compiled.plan, { input: compiled.input }).id,
        );
        expect(completed.errors).toEqual([]);
        expect(completed.status).toBe('succeeded');
        expect(
          calls.filter((call) => call.script === mongoInitialize),
        ).toHaveLength(1);
        expect(calls.find((call) => call.script === mongoUsers)?.host).toBe(
          primary.hostId,
        );
      } finally {
        await engine.close();
      }
    }
  });
  it('MongoDB 所有 Python 脚本通过语法检查，任务可独立保存', () => {
    const tasks = createMongoTasks();
    expect(tasks).toHaveLength(6);
    for (const { body } of tasks)
      for (const step of body.definition.steps) {
        if (step.call.kind !== 'action' || step.call.action !== 'ssh.exec')
          continue;
        const python = pythonBody(step.call.input.script);
        const result = spawnSync(
          'python3',
          ['-c', 'import sys; compile(sys.stdin.read(), "<task>", "exec")'],
          { input: python, encoding: 'utf8' },
        );
        expect(result.stderr).toBe('');
        expect(result.status).toBe(0);
        if (step.call.input.output === 'json') {
          const syntax = spawnSync(process.execPath, ['--check'], {
            input: javascriptBody(step.call.input.script),
            encoding: 'utf8',
          });
          expect(syntax.stderr).toBe('');
          expect(syntax.status).toBe(0);
        }
      }
  });
  it('MongoDB 初始化只使用 localhost exception 允许的状态查询，支持首次安装和重复执行', () => {
    const members = [
      { hostId: randomUUID(), hostname: 'mongo.test', port: 27017 },
    ];
    const source = javascriptBody(mongoInitialize);
    for (const initialized of [false, true]) {
      let initiations = 0;
      const output: string[] = [];
      runInNewContext(
        source,
        {
          process: {
            env: {
              DEPLOY_CRAB_INPUT: JSON.stringify({
                members,
                replicaSetName: 'rs0',
                adminUser: 'admin',
                adminPassword: 'test',
              }),
            },
          },
          db: {
            getSiblingDB: () => ({ auth: () => false }),
            hello: () => ({ primary: 'mongo.test:27017' }),
          },
          rs: {
            status: () => {
              if (!initialized)
                throw Object.assign(new Error('NotYetInitialized'), {
                  code: 94,
                });
              return { set: 'rs0', members: [{ name: 'mongo.test:27017' }] };
            },
            conf: () => {
              throw new Error('replSetGetConfig is unauthorized');
            },
            initiate: () => {
              initiations++;
              return { ok: 1 };
            },
          },
          sleep: () => {
            throw new Error('unexpected election timeout');
          },
          print: (value: string) => output.push(value),
        },
        { timeout: 1000 },
      );
      expect(initiations).toBe(initialized ? 0 : 1);
      expect(JSON.parse(output[0]!)).toEqual({
        primaryHostId: members[0]!.hostId,
        primary: 'mongo.test:27017',
        replicaSetName: 'rs0',
      });
    }
  });
  it('选项和范围无法通过 API 绕过，凭据只允许引用', () => {
    const parameters = TaskParameters.parse([
      {
        name: 'version',
        options: [
          { value: '8.0', label: '8' },
          { value: '9.0', label: '9' },
        ],
      },
      { name: 'port', type: 'number', minimum: 1, maximum: 65535 },
      { name: 'password', secret: true },
    ]);
    expect(
      resolveTaskInput(parameters, {
        version: '7.0',
        port: 70000,
        password: 'plaintext-password',
      }).issues,
    ).toHaveLength(3);
    expect(
      resolveTaskInput(parameters, {
        version: '9.0',
        port: 27017,
        password: randomUUID(),
      }).issues,
    ).toEqual([]);
    expect(() =>
      task([
        {
          id: 'bad',
          title: 'bad',
          call: script('bad'),
          placement: { kind: 'result', stepId: 'missing', path: [] },
        },
      ]),
    ).toThrow('依赖');
  });
});
