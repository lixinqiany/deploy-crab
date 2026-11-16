import {
  isExecutionFinished,
  type Run,
} from '@deploy-crab/contracts/execution';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionRegistry } from './action-registry';
import type {
  Action,
  ActionContext,
  ExecutionPlan,
  StepDefinition,
} from './definition';
import { ExecutionService } from './execution-service';
import { ExecutionFailure } from './execution-failure';
import { MemoryRunStore } from './run-store';

const gate = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const step = (
  id: string,
  extra: Partial<StepDefinition> = {},
): StepDefinition => ({ id, title: id, action: 'test', input: id, ...extra });
const plan = (
  steps: StepDefinition[],
  extra: Partial<ExecutionPlan> = {},
): ExecutionPlan => ({
  task: 'test',
  target: { address: 'example.test' },
  steps,
  ...extra,
});
const untilDone = async (
  service: ExecutionService,
  id: string,
): Promise<Run> => {
  await vi.waitFor(() =>
    expect(isExecutionFinished(service.get(id).status)).toBe(true),
  );
  return service.get(id);
};

describe('ExecutionService', () => {
  const services: ExecutionService[] = [];
  const create = (
    execute: Action['execute'],
    concurrency = 4,
    store = new MemoryRunStore(),
  ) => {
    const service = new ExecutionService(
      new ActionRegistry().register({ key: 'test', execute }),
      store,
      concurrency,
    );
    services.push(service);
    return service;
  };
  afterEach(async () => {
    await Promise.all(services.splice(0).map((service) => service.close()));
  });

  it('无依赖步骤并发，依赖在主体和所有钩子成功后才放行；结果可供后续读取', async () => {
    const body = gate(),
      cleanup = gate();
    const calls: string[] = [];
    const contexts = new Map<string, ActionContext>();
    const service = create(async (input, context) => {
      const name = String(input);
      calls.push(name);
      contexts.set(name, context);
      if (name === 'install') await body.promise;
      if (name === 'cleanup') await cleanup.promise;
      return name + '-result';
    });
    const run = service.submit(
      plan([
        step('install', {
          hooks: {
            finally: [{ key: 'cleanup', action: 'test', input: 'cleanup' }],
          },
        }),
        step('independent'),
        step('deploy', { dependsOn: ['install'] }),
      ]),
    );
    await vi.waitFor(() => expect(calls).toEqual(['install', 'independent']));
    body.resolve();
    await vi.waitFor(() => expect(calls).toContain('cleanup'));
    expect(calls).not.toContain('deploy');
    expect(contexts.get('cleanup')?.lifecycle).toMatchObject({
      phase: 'finally',
      result: 'install-result',
      errors: [],
    });
    cleanup.resolve();
    const done = await untilDone(service, run.id);
    expect(done.status).toBe('succeeded');
    expect(contexts.get('deploy')?.results).toMatchObject({
      install: 'install-result',
    });
    expect(done.steps[0]?.hooks[0]).toMatchObject({
      phase: 'finally',
      status: 'succeeded',
    });
  });

  it('before 失败跳过主体与 afterSuccess，finally 全部尝试并保留多个错误', async () => {
    const calls: string[] = [];
    const service = create((input, context) => {
      const name = String(input);
      calls.push(name);
      if (name === 'before' || name === 'cleanup-1')
        return Promise.reject(new ExecutionFailure(name, name));
      if (name === 'cleanup-2')
        expect(context.lifecycle.errors.map((error) => error.code)).toEqual([
          'before',
          'cleanup-1',
        ]);
      return Promise.resolve(null);
    });
    const run = service.submit(
      plan([
        step('body', {
          hooks: {
            before: [{ key: 'before', action: 'test', input: 'before' }],
            afterSuccess: [{ key: 'after', action: 'test', input: 'after' }],
            finally: [
              { key: 'one', action: 'test', input: 'cleanup-1' },
              { key: 'two', action: 'test', input: 'cleanup-2' },
            ],
          },
        }),
        step('dependent', { dependsOn: ['body'] }),
        step('independent'),
      ]),
    );
    const done = await untilDone(service, run.id);
    expect(done.status).toBe('failed');
    expect(done.steps.map((s) => s.status)).toEqual([
      'failed',
      'blocked',
      'succeeded',
    ]);
    expect(done.steps[0]?.errors.map((e) => e.code)).toEqual([
      'before',
      'cleanup-1',
    ]);
    expect(done.steps[0]?.hooks.map((h) => h.status)).toEqual([
      'failed',
      'skipped',
      'failed',
      'succeeded',
    ]);
    expect(calls).not.toContain('body');
    expect(calls).not.toContain('after');
    expect(calls).toContain('cleanup-2');
  });

  it('Run 收尾失败阻塞依赖 Run，其他 Run 可并发，通知异常不影响执行', async () => {
    const cleanup = gate();
    const calls: string[] = [];
    const service = create(async (input) => {
      calls.push(String(input));
      if (input === 'cleanup') {
        await cleanup.promise;
        throw new Error('cleanup failed');
      }
      return null;
    });
    service.subscribe(() => {
      throw new Error('observer failed');
    });
    const first = service.submit(
      plan([step('first')], {
        hooks: {
          finally: [{ key: 'cleanup', action: 'test', input: 'cleanup' }],
        },
      }),
    );
    const dependent = service.submit(plan([step('dependent')]), {
      dependsOn: [first.id],
    });
    const independent = service.submit(plan([step('independent')]));
    await untilDone(service, independent.id);
    expect(service.get(dependent.id).status).toBe('queued');
    cleanup.resolve();
    expect((await untilDone(service, first.id)).status).toBe('failed');
    expect((await untilDone(service, dependent.id)).status).toBe('blocked');
    expect(calls).not.toContain('dependent');
  });

  it('跨 Run 的成功依赖会在收尾后放行', async () => {
    const cleanup = gate();
    const calls: string[] = [];
    const service = create(async (input) => {
      calls.push(String(input));
      if (input === 'cleanup') await cleanup.promise;
      return null;
    });
    const first = service.submit(
      plan([step('first')], {
        hooks: {
          finally: [{ key: 'cleanup', action: 'test', input: 'cleanup' }],
        },
      }),
    );
    const next = service.submit(plan([step('next')]), {
      dependsOn: [first.id],
    });
    await vi.waitFor(() => expect(calls).toContain('cleanup'));
    expect(calls).not.toContain('next');
    cleanup.resolve();
    expect((await untilDone(service, next.id)).status).toBe('succeeded');
  });

  it('并发额度跨 Run 共用，排队取消不会启动 action', async () => {
    const started = gate();
    const calls: string[] = [];
    const service = create(async (input, context) => {
      calls.push(String(input));
      if (input === 'first') {
        started.resolve();
        await new Promise<void>((resolve) =>
          context.signal.addEventListener('abort', () => resolve(), {
            once: true,
          }),
        );
      }
      return null;
    }, 1);
    const first = service.submit(plan([step('first')]));
    const waiting = service.submit(plan([step('waiting')]));
    await started.promise;
    service.cancel(waiting.id);
    expect((await untilDone(service, waiting.id)).status).toBe('cancelled');
    expect(calls).toEqual(['first']);
    service.cancel(first.id);
    expect((await untilDone(service, first.id)).status).toBe('cancelled');
    const next = service.submit(plan([step('next')]));
    expect((await untilDone(service, next.id)).status).toBe('succeeded');
  });

  it('超时和取消都等待 action 释放资源，并执行 finally；收尾中的取消不会变成成功', async () => {
    const calls: string[] = [];
    const cleanup = gate();
    const service = create(async (input, context) => {
      calls.push(String(input));
      if (input === 'body')
        await new Promise<void>((resolve) =>
          context.signal.addEventListener('abort', () => resolve(), {
            once: true,
          }),
        );
      if (input === 'cleanup') {
        expect(context.signal.aborted).toBe(false);
        await cleanup.promise;
      }
      return null;
    });
    const timeout = service.submit(
      plan([
        step('body', {
          timeoutMs: 10,
          hooks: {
            finally: [{ key: 'cleanup', action: 'test', input: 'cleanup' }],
          },
        }),
      ]),
    );
    await vi.waitFor(() => expect(calls).toContain('cleanup'));
    expect(service.get(timeout.id).status).toBe('running');
    cleanup.resolve();
    expect(
      (await untilDone(service, timeout.id)).steps[0]?.errors[0]?.code,
    ).toBe('timeout');

    const ending = gate(),
      entered = gate();
    const second = create(async (input) => {
      if (input === 'cleanup') {
        entered.resolve();
        await ending.promise;
      }
      return null;
    });
    const cancelled = second.submit(
      plan([step('done')], {
        hooks: {
          finally: [{ key: 'cleanup', action: 'test', input: 'cleanup' }],
        },
      }),
    );
    await entered.promise;
    second.cancel(cancelled.id);
    ending.resolve();
    expect((await untilDone(second, cancelled.id)).status).toBe('cancelled');
  });

  it('首个 running 通知中取消仍生效，Run before 失败时终态不含未完成步骤', async () => {
    const execute = vi.fn<Action['execute']>().mockResolvedValue(null);
    const service = create(execute);
    service.subscribe((run) => {
      if (run.status === 'running') service.cancel(run.id);
    });
    const run = service.submit(plan([step('body')]));
    const done = await untilDone(service, run.id);
    expect(done.status).toBe('cancelled');
    expect(done.steps[0]?.status).toBe('cancelled');
    expect(execute).not.toHaveBeenCalled();

    const failed = create(() => Promise.reject(new Error('before failed')));
    const events: Run[] = [];
    failed.subscribe((r) => {
      if (isExecutionFinished(r.status)) events.push(r);
    });
    await untilDone(
      failed,
      failed.submit(
        plan([step('body')], {
          hooks: { before: [{ key: 'before', action: 'test' }] },
        }),
      ).id,
    );
    expect(
      events.every((r) => r.steps.every((s) => isExecutionFinished(s.status))),
    ).toBe(true);
  });

  it('拒绝无效依赖，快照与读取副本隔离，输出有界', async () => {
    const service = create((_input, context) => {
      context.output('stdout', 'x'.repeat(100_000));
      for (let i = 0; i < 150; i++) context.output('stderr', String(i));
      return Promise.resolve(context.target);
    });
    expect(() =>
      service.submit(
        plan([
          step('a', { dependsOn: ['b'] }),
          step('b', { dependsOn: ['a'] }),
        ]),
      ),
    ).toThrow('环');
    expect(() =>
      service.submit(plan([step('a', { dependsOn: ['missing'] })])),
    ).toThrow('不存在');
    expect(() =>
      service.submit(plan([step('a')]), { dependsOn: ['missing'] }),
    ).toThrow('不存在');
    const definition = plan([step('a')]);
    const run = service.submit(definition);
    definition.target = 'changed';
    run.target = 'changed too';
    const done = await untilDone(service, run.id);
    expect(done.target).toEqual({ address: 'example.test' });
    expect(done.outputTruncated).toBe(true);
    expect(done.output.length).toBeLessThanOrEqual(128);
    expect(
      done.output.reduce((n, chunk) => n + chunk.text.length, 0),
    ).toBeLessThanOrEqual(32_768);
    done.steps.length = 0;
    expect(service.get(run.id).steps).toHaveLength(1);
  });

  it('内存记录到期清理，有未结束依赖时保留；关闭服务取消并等待运行中的任务', async () => {
    let now = Date.now();
    const store = new MemoryRunStore(1000, 2, () => now);
    const started = gate();
    const service = create(
      async (input, context) => {
        if (input === 'hold') {
          started.resolve();
          await new Promise<void>((resolve) =>
            context.signal.addEventListener('abort', () => resolve(), {
              once: true,
            }),
          );
        }
        return null;
      },
      1,
      store,
    );
    const first = await untilDone(
      service,
      service.submit(plan([step('first')])).id,
    );
    const dependent = service.submit(plan([step('hold')]), {
      dependsOn: [first.id],
    });
    await started.promise;
    now = Date.parse(first.finishedAt!) + 1001;
    expect(store.get(first.id)).toBeDefined();
    expect(() => service.submit(plan([step('extra')]))).toThrow('上限');
    await service.close();
    expect(store.get(dependent.id)?.status).toBe('cancelled');
    now += 10_000;
    expect(store.list()).toEqual([]);
    expect(() => service.submit(plan([step('closed')]))).toThrow('已关闭');
  });
});
