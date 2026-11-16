import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  CreateTaskBody,
  Task,
  TaskCatalog,
} from '@deploy-crab/contracts/task';
import { SshRunner } from '@deploy-crab/core/ssh/ssh-runner';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '@/app.module';

const migrationsDirectory = fileURLToPath(
  new URL(
    '../../migrations/',
    import.meta.resolve('@deploy-crab/core/database/database'),
  ),
);
const body = (name = 'task'): CreateTaskBody => ({
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
});

describe('任务创建 (e2e)', () => {
  let app: INestApplication<App>, dataDirectory: string;
  const probe = vi.fn();
  const exec = vi.fn();
  const boot = async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule.forRoot({ dataDirectory, migrationsDirectory })],
    })
      .overrideProvider(SshRunner)
      .useValue({ probe, exec })
      .compile();
    app = module.createNestApplication({ logger: false });
    await app.init();
  };
  beforeEach(async () => {
    probe.mockReset();
    exec.mockReset();
    dataDirectory = await mkdtemp(join(tmpdir(), 'deploy-crab-tasks-e2e-'));
    await boot();
  });
  afterEach(async () => {
    await app.close();
    await rm(dataDirectory, { recursive: true, force: true });
  });
  const http = () => request(app.getHttpServer());
  const create = async (input: CreateTaskBody): Promise<Task> =>
    (await http().post('/tasks').send(input).expect(201)).body as Task;
  const replacement = (task: Task) => ({
    name: task.name,
    description: task.description,
    labels: task.labels,
    sourceUrl: task.sourceUrl,
    definition: task.definition,
    revision: task.revision,
  });

  it('引用任务可选传参，步骤及两层钩子重启后均保留；保存不执行脚本', async () => {
    const child = await create({
      ...body('可传参任务'),
      definition: {
        ...body().definition,
        parameters: [
          { name: 'mirrorUrl' },
          { name: 'enabled', type: 'boolean' },
          { name: 'count', type: 'number' },
          { name: 'nested', type: 'json' },
          { name: 'phase' },
        ],
      },
    });
    const input = {
      mirrorUrl: 'https://example.test',
      enabled: false,
      count: 0,
      nested: [null, { value: '' }],
    };
    const call = { kind: 'task' as const, taskId: child.id, input };
    const parent = await create({
      name: '调用者',
      definition: {
        steps: [
          {
            id: 'ref',
            title: '引用',
            call,
            hooks: {
              finally: [
                {
                  key: 'cleanup',
                  title: '收尾',
                  call: { ...call, input: { phase: 'step' } },
                },
              ],
            },
          },
        ],
        hooks: {
          before: [
            {
              key: 'prepare',
              title: '准备',
              call: { ...call, input: { phase: 'task' } },
            },
          ],
        },
      },
    });
    expect(parent.definition.steps[0]?.call).toEqual(call);
    await app.close();
    await boot();
    await http().get(`/tasks/${parent.id}`).expect(200, parent);
    for (const invalid of [null, [], 'text', { value: 'x'.repeat(16_001) }]) {
      await http()
        .put(`/tasks/${parent.id}`)
        .send({
          ...replacement(parent),
          definition: {
            steps: [
              { id: 'ref', title: '引用', call: { ...call, input: invalid } },
            ],
          },
        })
        .expect(400);
    }
    const cleared = await http()
      .put(`/tasks/${parent.id}`)
      .send({
        ...replacement(parent),
        definition: {
          steps: [
            {
              id: 'ref',
              title: '引用',
              call: { kind: 'task', taskId: child.id },
            },
          ],
        },
      })
      .expect(200);
    expect((cleared.body as Task).definition.steps[0]?.call).toEqual({
      kind: 'task',
      taskId: child.id,
    });
    expect(probe).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
  });

  it('必填参数在引用保存时由服务端校验，修改定义不能破坏已有引用', async () => {
    const child = await create({
      ...body('必填参数任务'),
      definition: {
        ...body().definition,
        parameters: [
          { name: 'url', required: true },
          { name: 'enabled', type: 'boolean', required: true },
        ],
      },
    });
    const parent = (input?: unknown) => ({
      name: '调用者',
      definition: {
        steps: [
          {
            id: 'ref',
            title: '引用',
            call: {
              kind: 'task',
              taskId: child.id,
              ...(input === undefined ? {} : { input }),
            },
          },
        ],
      },
    });
    for (const input of [
      undefined,
      { url: 'x' },
      { url: ' ', enabled: false },
      { url: 'x', enabled: 'false' },
      { url: 'x', enabled: false, extra: 'no' },
    ])
      await http().post('/tasks').send(parent(input)).expect(422);
    await http()
      .post('/tasks')
      .send(parent({ url: 'https://example.test', enabled: false }))
      .expect(201);
    await http()
      .put(`/tasks/${child.id}`)
      .send({
        ...replacement(child),
        definition: {
          ...child.definition,
          parameters: [
            ...child.definition.parameters,
            { name: 'newRequired', required: true },
          ],
        },
      })
      .expect(422);
    await http().get(`/tasks/${child.id}`).expect(200, child);
    await http()
      .post('/tasks')
      .send({
        ...body('错误默认值'),
        definition: {
          ...body().definition,
          parameters: [{ name: 'count', type: 'number', defaultValue: '3' }],
        },
      })
      .expect(400);
    expect(exec).not.toHaveBeenCalled();
  });

  it('创建、编辑并重新打开任务，重启后保留，整个过程不调用 SSH', async () => {
    const catalog = (await http().get('/tasks/catalog').expect(200))
      .body as TaskCatalog;
    expect(catalog.templates).toEqual([]);
    const task = await create({
      ...body('检查连接'),
      labels: [' 巡检 ', 'SSH'],
    });
    expect(task.labels).toEqual(['巡检', 'SSH']);
    expect(task.definition.steps).toHaveLength(1);
    expect(task.definition.steps[0]?.skippable).toBe(false);
    await http().get(`/tasks/${task.id}`).expect(200, task);
    await http().get('/tasks').expect(200, [task]);
    const updated = (
      await http()
        .put(`/tasks/${task.id}`)
        .send({
          ...replacement(task),
          name: '我的连接检查',
          labels: ['网络'],
          definition: {
            ...task.definition,
            steps: task.definition.steps.map((step) => ({
              ...step,
              skippable: true,
            })),
          },
        })
        .expect(200)
    ).body as Task;
    expect(updated.revision).toBe(2);
    expect(updated.labels).toEqual(['网络']);
    expect(updated.definition.steps[0]?.skippable).toBe(true);
    await http().put(`/tasks/${task.id}`).send(replacement(task)).expect(409);
    await http().post(`/tasks/${task.id}/run`).expect(404);
    await app.close();
    await boot();
    await http().get(`/tasks/${task.id}`).expect(200, updated);
    const cleared = (
      await http()
        .put(`/tasks/${task.id}`)
        .send({
          ...replacement(updated),
          labels: [],
          definition: {
            ...updated.definition,
            steps: updated.definition.steps.map((step) => ({
              ...step,
              skippable: false,
            })),
          },
        })
        .expect(200)
    ).body as Task;
    expect(cleared.labels).toEqual([]);
    expect(cleared.definition.steps[0]?.skippable).toBe(false);
    expect(probe).not.toHaveBeenCalled();
  });

  it('组合已有任务与脚本，保护引用并拒绝任务循环', async () => {
    const child = await create(body('child'));
    expect(child.labels).toEqual([]);
    const parent = await create({
      name: 'parent',
      definition: {
        steps: [
          {
            id: 'prepare',
            title: '准备',
            call: { kind: 'task', taskId: child.id },
          },
          {
            id: 'script',
            title: '脚本',
            dependsOn: ['prepare'],
            call: {
              kind: 'action',
              action: 'ssh.exec',
              input: { script: 'echo ready' },
            },
          },
        ],
      },
    });
    await http().delete(`/tasks/${child.id}`).expect(409);
    await http()
      .put(`/tasks/${child.id}`)
      .send({
        ...replacement(child),
        definition: {
          steps: [
            {
              id: 'cycle',
              title: '循环',
              call: { kind: 'task', taskId: parent.id },
            },
          ],
        },
      })
      .expect(422);
    await http().delete(`/tasks/${parent.id}`).expect(204);
    await http().delete(`/tasks/${child.id}`).expect(204);
    await http().get('/tasks').expect(200, []);
  });

  it('非法输入返回字段问题，名称冲突和缺失引用返回业务错误', async () => {
    await create(body('task'));
    await http()
      .post('/tasks')
      .send({
        ...body('invalid-skippable'),
        definition: {
          steps: [
            {
              id: 'check',
              title: '检查连接',
              call: { kind: 'action', action: 'ssh.probe' },
              skippable: 'true',
            },
          ],
        },
      })
      .expect(400);
    for (const labels of [
      [''],
      ['a', ' a '],
      ['two words'],
      ['x'.repeat(33)],
      Array.from({ length: 21 }, (_, index) => `tag-${index}`),
    ]) {
      await http()
        .post('/tasks')
        .send({ ...body('invalid-labels'), labels })
        .expect(400)
        .expect((response) => {
          const payload = response.body as {
            code: string;
            issues: { path: (string | number)[] }[];
          };
          expect(payload.code).toBe('validation_failed');
          expect(payload.issues[0]?.path[0]).toBe('labels');
        });
    }
    await http().post('/tasks').send(body('TASK')).expect(409);
    await http()
      .post('/tasks')
      .send({ name: 'invalid', definition: { steps: [] } })
      .expect(400);
    await http()
      .post('/tasks')
      .send({
        name: 'invalid',
        definition: {
          steps: [
            {
              id: 'a',
              title: '脚本',
              call: {
                kind: 'action',
                action: 'ssh.exec',
                input: { script: '' },
              },
            },
          ],
        },
      })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: 'validation_failed',
          issues: [
            { path: ['definition', 'steps', 0, 'call', 'input', 'script'] },
          ],
        });
      });
    await http()
      .post('/tasks')
      .send({
        name: 'missing',
        definition: {
          steps: [
            {
              id: 'a',
              title: '引用',
              call: {
                kind: 'task',
                taskId: '00000000-0000-4000-8000-000000000000',
              },
            },
          ],
        },
      })
      .expect(422);
    await http().get('/tasks/invalid-id').expect(400);
  });
});
