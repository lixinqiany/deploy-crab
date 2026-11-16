import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  CheckHostBody,
  ConnectionTarget,
  ProbeResult,
} from '@deploy-crab/contracts/connection';
import {
  isExecutionFinished,
  type Run,
} from '@deploy-crab/contracts/execution';
import type { Host } from '@deploy-crab/contracts/host';
import { ExecutionFailure } from '@deploy-crab/core/execution/execution-failure';
import { SshRunner, type SshContext } from '@deploy-crab/core/ssh/ssh-runner';
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
const draft: CheckHostBody = { publicAddress: '192.0.2.10', user: 'deploy' };

describe('临时主机连接检查 (e2e)', () => {
  let app: INestApplication<App>;
  let dataDirectory: string;
  const probe =
    vi.fn<
      (target: ConnectionTarget, context: SshContext) => Promise<ProbeResult>
    >();
  const boot = async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot({ dataDirectory, migrationsDirectory })],
    })
      .overrideProvider(SshRunner)
      .useValue({ probe })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    await app.init();
  };
  beforeEach(async () => {
    dataDirectory = await mkdtemp(join(tmpdir(), 'deploy-crab-execution-e2e-'));
    probe.mockReset();
    probe.mockImplementation((target, context) => {
      context.output('stdout', 'probe completed');
      return Promise.resolve({
        connected: true,
        elapsedMs: 5,
        ...target.endpoint,
        hopCount: target.jumps.length,
      });
    });
    await boot();
  });
  afterEach(async () => {
    await app.close();
    await rm(dataDirectory, { recursive: true, force: true });
  });
  const http = () => request(app.getHttpServer());
  const check = async (body: CheckHostBody): Promise<Run> => {
    const response = await http()
      .post('/api/hosts/check-connection')
      .send(body)
      .expect(202);
    return response.body as Run;
  };
  const done = async (id: string): Promise<Run> => {
    let run: Run;
    await vi.waitFor(async () => {
      const response = await http().get(`/api/runs/${id}`).expect(200);
      run = response.body as Run;
      expect(isExecutionFinished(run.status)).toBe(true);
    });
    return run!;
  };
  const host = async (
    name: string,
    address: string,
    extra: object = {},
  ): Promise<Host> => {
    const response = await http()
      .post('/api/hosts')
      .send({ name, publicAddress: address, user: 'ops', ...extra })
      .expect(201);
    return response.body as Host;
  };

  it('无需名称或保存即可检查：Run 没有 session，返回步骤、结果和输出，重启后记录消失', async () => {
    const run = await check(draft);
    expect(run).toMatchObject({
      status: 'queued',
      task: 'host.check',
      sessionId: null,
      retention: 'memory',
    });
    const result = await done(run.id);
    expect(result).toMatchObject({
      status: 'succeeded',
      steps: [
        {
          action: 'ssh.probe',
          status: 'succeeded',
          result: { connected: true },
        },
      ],
      output: [{ stream: 'stdout', text: 'probe completed' }],
    });
    await http().get('/api/hosts').expect(200, []);
    await app.close();
    await boot();
    await http().get(`/api/runs/${run.id}`).expect(404);
    await http().get('/api/hosts').expect(200, []);
  });

  it('冻结草稿及多跳快照，各跳保留自己的认证；执行不修改主机资料', async () => {
    const outer = await host('outer', '192.0.2.1', {
      auth: { method: 'key', keyPath: '/tmp/outer-key' },
    });
    const inner = await host('inner', '10.0.0.2', { jumpHostId: outer.id });
    const target = await host('target', '10.0.0.3', { jumpHostId: inner.id });
    const run = await check({
      ...draft,
      hostId: target.id,
      jumpHostId: inner.id,
      auth: { method: 'key', keyPath: '/tmp/target-key' },
    });
    await http()
      .patch(`/api/hosts/${outer.id}`)
      .send({ publicAddress: '192.0.2.99' })
      .expect(200);
    const result = await done(run.id);
    expect(result.target).toMatchObject({
      hostId: target.id,
      endpoint: { address: '192.0.2.10', auth: { keyPath: '/tmp/target-key' } },
      jumps: [
        { address: '192.0.2.1', auth: { keyPath: '/tmp/outer-key' } },
        { address: '10.0.0.2', auth: { method: 'agent' } },
      ],
    });
    expect(probe.mock.calls[0]?.[0]).toEqual(result.target);
    await http().get(`/api/hosts/${target.id}`).expect(200, target);
  });

  it('拒绝非法输入、缺失跳板和草稿中的跳板环，不派发 SSH', async () => {
    await http()
      .post('/api/hosts/check-connection')
      .send({ ...draft, publicAddress: '$(touch /tmp/injected)' })
      .expect(400);
    await http()
      .post('/api/hosts/check-connection')
      .send({ ...draft, jumpHostId: '00000000-0000-4000-8000-000000000000' })
      .expect(422);
    const first = await host('first', '192.0.2.1');
    const second = await host('second', '192.0.2.2', { jumpHostId: first.id });
    await http()
      .post('/api/hosts/check-connection')
      .send({ ...draft, hostId: first.id, jumpHostId: second.id })
      .expect(422);
    expect(probe).not.toHaveBeenCalled();
  });

  it('失败保留具体诊断；运行中的检查可以取消', async () => {
    probe.mockRejectedValueOnce(
      new ExecutionFailure('authentication_failed', 'SSH 认证失败'),
    );
    const failed = await done((await check(draft)).id);
    expect(failed).toMatchObject({
      status: 'failed',
      steps: [
        {
          errors: [{ code: 'authentication_failed', message: 'SSH 认证失败' }],
        },
      ],
    });
    probe.mockImplementation(
      (_target, context) =>
        new Promise((_resolve, reject) => {
          context.signal.addEventListener(
            'abort',
            () => reject(new ExecutionFailure('cancelled', '已取消')),
            { once: true },
          );
        }),
    );
    const run = await check(draft);
    await http().post(`/api/runs/${run.id}/cancel`).expect(202);
    expect((await done(run.id)).status).toBe('cancelled');
    await http().post(`/api/runs/${run.id}/cancel`).expect(202);
    await http().get('/api/runs/not-a-uuid').expect(400);
  });
});
