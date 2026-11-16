import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { Cluster } from '@deploy-crab/contracts/cluster';
import type { Task, CreateTaskBody } from '@deploy-crab/contracts/task';
import type {
  Session,
  ExecuteSessionTask,
  RunTree,
  SessionRunPage,
} from '@deploy-crab/contracts/session';
import type { Run } from '@deploy-crab/contracts/execution';
import { SshRunner, type SshContext } from '@deploy-crab/core/ssh/ssh-runner';
import type { ConnectionTarget } from '@deploy-crab/contracts/connection';
import type { SshScriptInput } from '@deploy-crab/contracts/ssh-script';
import type { TaskInput } from '@deploy-crab/contracts/task-input';
import { Database } from '@deploy-crab/core/database/database';
import { runs } from '@deploy-crab/core/database/tables/runs';
import { eq } from 'drizzle-orm';
import { AppModule } from '@/app.module';

const migrationsDirectory = fileURLToPath(
  new URL(
    '../../migrations/',
    import.meta.resolve('@deploy-crab/core/database/database'),
  ),
);
const script = (text: string) => ({
  kind: 'action' as const,
  action: 'ssh.exec' as const,
  input: { script: text },
});

describe('Session 执行 (e2e)', () => {
  let app: INestApplication<App>, dataDirectory: string;
  const calls: { host: string | null; script: string; input: TaskInput }[] = [];
  const exec = vi.fn(
    async (
      target: ConnectionTarget,
      script: SshScriptInput,
      input: TaskInput,
      context: SshContext,
    ) => {
      calls.push({ host: target.hostId, script: script.script, input });
      context.output('stdout', `executed:${script.script}\n`);
      if (script.script === 'fail') throw new Error('install failed');
      if (script.script === 'wait')
        await new Promise<void>((resolve) =>
          context.signal.addEventListener('abort', () => resolve(), {
            once: true,
          }),
        );
      return { exitCode: 0 as const, elapsedMs: 1 };
    },
  );
  const boot = async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule.forRoot({ dataDirectory, migrationsDirectory })],
    })
      .overrideProvider(SshRunner)
      .useValue({ exec, probe: vi.fn() })
      .compile();
    app = module.createNestApplication({ logger: false });
    await app.init();
  };
  beforeEach(async () => {
    calls.length = 0;
    exec.mockClear();
    dataDirectory = await mkdtemp(join(tmpdir(), 'deploy-crab-sessions-'));
    await boot();
  });
  afterEach(async () => {
    await app.close();
    await rm(dataDirectory, { recursive: true, force: true });
  });
  const http = () => request(app.getHttpServer());
  const createTask = async (body: CreateTaskBody): Promise<Task> =>
    (await http().post('/tasks').send(body).expect(201)).body as Task;
  const host = async (name: string) =>
    (
      (
        await http()
          .post('/hosts')
          .send({ name, publicAddress: '192.0.2.10', user: 'root' })
          .expect(201)
      ).body as { id: string }
    ).id;
  const session = async (): Promise<Session> =>
    (await http().post('/sessions').send({ title: '我的部署会话' }).expect(201))
      .body as Session;
  const submit = async (
    sessionId: string,
    body: ExecuteSessionTask,
  ): Promise<Run[]> =>
    (await http().post(`/sessions/${sessionId}/runs`).send(body).expect(202))
      .body as Run[];
  const finished = async (id: string) => {
    await expect
      .poll(
        async () =>
          ((await http().get(`/runs/${id}`).expect(200)).body as Run).status,
        { timeout: 3000 },
      )
      .not.toMatch(/queued|running/);
    return (await http().get(`/runs/${id}/tree`).expect(200)).body as RunTree;
  };
  const fixture = async (bodyScript = 'install') => {
    const child = await createTask({
      name: '配置源',
      definition: {
        parameters: [{ name: 'url', required: true }],
        steps: [{ id: 'work', title: 'work', call: script(bodyScript) }],
        hooks: {
          finally: [
            { key: 'cleanup', title: 'cleanup', call: script('cleanup') },
          ],
        },
      },
    });
    const parent = await createTask({
      name: '安装 Docker',
      definition: {
        parameters: [{ name: 'mirror' }],
        steps: [
          {
            id: 'configure',
            title: 'configure',
            skippable: true,
            call: {
              kind: 'task',
              taskId: child.id,
              inputBindings: { url: { from: 'taskInput', key: 'mirror' } },
            },
          },
          {
            id: 'verify',
            title: 'verify',
            dependsOn: ['configure'],
            call: { ...script('verify'), usesInputs: [] },
          },
        ],
      },
    });
    const s = await session();
    const body: ExecuteSessionTask = {
      requestId: randomUUID(),
      taskId: parent.id,
      taskRevisions: { [parent.id]: 1, [child.id]: 1 },
      hostIds: [await host('host-a')],
      input: { mirror: 'https://mirror.test' },
      skippedSteps: [],
      dependsOn: [],
    };
    return { child, parent, s, body };
  };

  it('按集群分组派发并去重；成员变化后拒绝陈旧预览，历史快照与幂等重试保持原范围', async () => {
    const { s, body } = await fixture();
    const a = body.hostIds[0]!;
    const b = await host('host-b');
    const c = await host('host-c');
    const cluster = (
      await http()
        .post('/clusters')
        .send({
          name: '测试集群',
          members: [
            { hostId: a, groups: ['app', 'infra'] },
            { hostId: b, groups: ['app'] },
            { hostId: c, groups: ['db'] },
          ],
        })
        .expect(201)
    ).body as Cluster;
    const selection = {
      kind: 'cluster' as const,
      clusterId: cluster.id,
      scope: { kind: 'groups' as const, groups: ['app', 'infra'] },
    };
    const requestBody = {
      ...body,
      hostIds: [a, b],
      targetSelection: selection,
    };
    const draft = (
      await http()
        .patch(`/sessions/${s.id}`)
        .send({
          revision: 1,
          draft: { hostIds: [a, b], targetSelection: selection },
        })
        .expect(200)
    ).body as Session;
    expect(draft.draft.targetSelection).toEqual(selection);
    const submitted = await submit(s.id, requestBody);
    expect(submitted).toHaveLength(2);
    for (const run of submitted) {
      expect((await finished(run.id)).run.targetScope).toEqual({
        selection,
        label: '测试集群 / app、infra',
        hostIds: [a, b],
      });
    }
    const all = await submit(s.id, {
      ...body,
      requestId: randomUUID(),
      hostIds: [a, b, c],
      targetSelection: { ...selection, scope: { kind: 'all' } },
    });
    expect(all).toHaveLength(3);
    for (const run of all) await finished(run.id);
    const specified = await submit(s.id, {
      ...body,
      requestId: randomUUID(),
      hostIds: [b],
      targetSelection: { ...selection, scope: { kind: 'hosts', hostIds: [b] } },
    });
    expect(specified).toHaveLength(1);
    await finished(specified[0]!.id);
    const count = calls.length;
    await http()
      .patch(`/clusters/${cluster.id}`)
      .send({
        name: '改名后的集群',
        members: [
          { hostId: a, groups: ['app', 'infra'] },
          { hostId: c, groups: ['app'] },
        ],
      })
      .expect(200);
    await http()
      .post(`/sessions/${s.id}/runs`)
      .send({ ...requestBody, requestId: randomUUID() })
      .expect(409);
    expect((await submit(s.id, requestBody)).map((run) => run.id)).toEqual(
      submitted.map((run) => run.id),
    );
    expect(calls).toHaveLength(count);
    await app.close();
    await boot();
    const history = (await http().get(`/sessions/${s.id}/runs`).expect(200))
      .body as SessionRunPage;
    const original = history.items.filter(
      (run) => run.requestId === body.requestId,
    );
    expect(original).toHaveLength(2);
    expect(
      original.every(
        (run) => run.targetScope?.label === '测试集群 / app、infra',
      ),
    ).toBe(true);
    expect(original[0]?.targetScope?.hostIds).toEqual([a, b]);
  });

  it('拒绝集群外主机、空范围和伪造预览，不产生部分执行', async () => {
    const { s, body } = await fixture();
    const outside = await host('outside');
    const cluster = (
      await http()
        .post('/clusters')
        .send({
          name: '目标集群',
          members: [{ hostId: body.hostIds[0], groups: ['app'] }],
        })
        .expect(201)
    ).body as Cluster;
    await http()
      .post(`/sessions/${s.id}/runs`)
      .send({
        ...body,
        hostIds: [outside],
        targetSelection: {
          kind: 'cluster',
          clusterId: cluster.id,
          scope: { kind: 'hosts', hostIds: [outside] },
        },
      })
      .expect(400);
    await http()
      .post(`/sessions/${s.id}/runs`)
      .send({
        ...body,
        targetSelection: {
          kind: 'cluster',
          clusterId: cluster.id,
          scope: { kind: 'groups', groups: [] },
        },
      })
      .expect(400);
    await http()
      .post(`/sessions/${s.id}/runs`)
      .send({
        ...body,
        hostIds: [outside],
        targetSelection: {
          kind: 'cluster',
          clusterId: cluster.id,
          scope: { kind: 'all' },
        },
      })
      .expect(409);
    expect(calls).toHaveLength(0);
    expect(
      ((await http().get(`/sessions/${s.id}/runs`)).body as SessionRunPage)
        .items,
    ).toEqual([]);
  });

  it('手动标题与配置持久化；多主机调用、绑定、依赖、钩子和输出跑通，重复请求不再执行', async () => {
    const { s, body } = await fixture();
    body.hostIds.push(await host('host-b'));
    const updated = (
      await http()
        .patch(`/sessions/${s.id}`)
        .send({
          title: '生产环境部署',
          revision: s.revision,
          draft: {
            taskId: body.taskId,
            hostIds: body.hostIds,
            fields: { mirror: 'https://mirror.test' },
          },
        })
        .expect(200)
    ).body as Session;
    await http()
      .patch(`/sessions/${s.id}`)
      .send({ title: 'stale', revision: 1 })
      .expect(409);
    const submitted = await submit(s.id, body);
    expect(submitted).toHaveLength(2);
    for (const run of submitted) {
      const tree = await finished(run.id);
      expect(tree.run.status).toBe('succeeded');
      expect(tree.children).toHaveLength(1);
      expect(tree.children[0]?.run.input).toEqual({
        url: 'https://mirror.test',
      });
      expect(tree.children[0]?.run.output[0]?.text).toContain(
        'executed:install',
      );
      expect(
        calls
          .filter(
            (call) =>
              call.host === (tree.run.target as ConnectionTarget).hostId,
          )
          .map((call) => call.script),
      ).toEqual(['install', 'cleanup', 'verify']);
    }
    expect(
      calls
        .filter((call) => call.script === 'verify')
        .every((call) => Object.keys(call.input).length === 0),
    ).toBe(true);
    expect((await submit(s.id, body)).map((run) => run.id)).toEqual(
      submitted.map((run) => run.id),
    );
    expect(calls).toHaveLength(6);
    await http()
      .post(`/sessions/${s.id}/runs`)
      .send({ ...body, input: { mirror: 'changed' } })
      .expect(409);
    await app.close();
    await boot();
    const restored = (await http().get(`/sessions/${s.id}`).expect(200))
      .body as Session;
    expect(restored.title).toBe(updated.title);
    expect(restored.draft).toEqual(updated.draft);
    const history = (
      await http().get(`/sessions/${s.id}/runs?limit=1`).expect(200)
    ).body as SessionRunPage;
    expect(history.items).toHaveLength(1);
    expect(history.nextCursor).toBeTruthy();
    const next = (
      await http()
        .get(`/sessions/${s.id}/runs?before=${history.nextCursor}&limit=1`)
        .expect(200)
    ).body as SessionRunPage;
    expect(next.items).toHaveLength(1);
    expect(next.items[0]?.id).not.toBe(history.items[0]?.id);
    expect(history.items[0]?.requestId).toBe(body.requestId);
    expect(next.items[0]?.requestId).toBe(body.requestId);
    expect((await finished(submitted[0]!.id)).run.status).toBe('succeeded');
    expect(calls).toHaveLength(6);
  });
  it('跳过引用任务不验证其必填值也不执行其钩子，但后续步骤正常执行', async () => {
    const { s, body } = await fixture();
    const submitted = await submit(s.id, {
      ...body,
      input: {},
      skippedSteps: ['steps.configure'],
    });
    const tree = await finished(submitted[0]!.id);
    expect(tree.run.status).toBe('succeeded');
    expect(tree.run.steps[0]?.status).toBe('skipped');
    expect(tree.children).toEqual([]);
    expect(calls.map((call) => call.script)).toEqual(['verify']);
  });
  it('派发前拒绝无效参数、强行跳过、缺失主机和陈旧任务版本，不产生部分执行', async () => {
    const { s, body } = await fixture();
    for (const patch of [
      { input: {} },
      { skippedSteps: ['steps.verify'] },
      { skippedSteps: ['missing'] },
    ])
      await http()
        .post(`/sessions/${s.id}/runs`)
        .send({ ...body, ...patch })
        .expect(400);
    await http()
      .post(`/sessions/${s.id}/runs`)
      .send({ ...body, taskRevisions: {} })
      .expect(409);
    await http()
      .post(`/sessions/${s.id}/runs`)
      .send({ ...body, hostIds: [...body.hostIds, randomUUID()] })
      .expect(404);
    expect(
      ((await http().get(`/sessions/${s.id}/runs`)).body as SessionRunPage)
        .items,
    ).toEqual([]);
    expect(calls).toEqual([]);
  });
  it('子任务失败先完成收尾，再阻塞步骤和后续 Run', async () => {
    const { s, body } = await fixture('fail');
    const [first] = await submit(s.id, body);
    const [second] = await submit(s.id, {
      ...body,
      requestId: randomUUID(),
      dependsOn: [first!.id],
    });
    expect((await finished(first!.id)).run.status).toBe('failed');
    expect((await finished(second!.id)).run.status).toBe('blocked');
    expect(calls.map((call) => call.script)).toEqual(['fail', 'cleanup']);
  });
  it('取消传播到子任务并等待收尾，运行中不允许删除会话', async () => {
    const { s, body } = await fixture('wait');
    const [run] = await submit(s.id, body);
    await expect.poll(() => calls.length).toBe(1);
    await http().delete(`/sessions/${s.id}`).expect(409);
    await http().post(`/runs/${run!.id}/cancel`).expect(202);
    const tree = await finished(run!.id);
    expect(tree.run.status).toBe('cancelled');
    expect(tree.children[0]?.run.status).toBe('cancelled');
    expect(calls.map((call) => call.script)).toEqual(['wait', 'cleanup']);
    await http().delete(`/sessions/${s.id}`).expect(204);
    await http().get(`/runs/${run!.id}`).expect(404);
  });
  it('启动时将未结束的持久记录标记为中断，禁止自动重新执行', async () => {
    const { s, body } = await fixture();
    const [run] = await submit(s.id, body);
    const tree = await finished(run!.id);
    const snapshot = {
      ...tree.run,
      status: 'running' as const,
      phase: 'body' as const,
      finishedAt: null,
    };
    snapshot.steps[0]!.status = 'running';
    app
      .get(Database)
      .write((tx) =>
        tx
          .update(runs)
          .set({ status: 'running', snapshot })
          .where(eq(runs.id, run!.id))
          .run(),
      );
    await app.close();
    calls.length = 0;
    await boot();
    const restored = await finished(run!.id);
    expect(restored.run.status).toBe('interrupted');
    expect(restored.run.steps[0]?.status).toBe('interrupted');
    expect(restored.run.errors[0]?.code).toBe('interrupted');
    expect(calls).toEqual([]);
  });
});
