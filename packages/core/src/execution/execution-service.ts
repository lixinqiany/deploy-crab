import { randomUUID } from 'node:crypto';
import {
  TaskParameters,
  resolveTaskInput,
  type TaskInput,
} from '@deploy-crab/contracts/task-input';
import {
  isExecutionFinished,
  type ExecutionError,
  type ExecutionState,
  type ExecutionStatus,
  type HookExecution,
  type HookPhase,
  type Run,
  type StepExecution,
} from '@deploy-crab/contracts/execution';
import {
  ConflictError,
  InvalidReferenceError,
  NotFoundError,
  ValidationError,
} from '../errors/domain-error';
import type { ActionRegistry } from './action-registry';
import { Concurrency } from './concurrency';
import type { ActionCall, ExecutionPlan, Hooks } from './definition';
import {
  checkAborted,
  executionError,
  ExecutionFailure,
} from './execution-failure';
import type { RunStore } from './run-store';
import type { RunTree } from '@deploy-crab/contracts/session';

const PHASES: HookPhase[] = ['before', 'afterSuccess', 'finally'];
const initialState = (): ExecutionState => ({
  status: 'queued',
  startedAt: null,
  finishedAt: null,
  errors: [],
  result: null,
});

interface PendingRun {
  run: Run;
  plan: ExecutionPlan;
  controller: AbortController;
}

export interface SubmitOptions {
  input?: TaskInput;
  sessionId?: string | null;
  source?: string;
  dependsOn?: string[];
  parentRunId?: string;
  requestId?: string;
  requestHash?: string;
}

/**
 * 单进程执行内核：两层静态依赖、受控并发、生命周期和结果。
 * 一个 Run 一个目标；引用任务拥有子 Run，编排不占用叶子 Action 的并发槽。
 */
export class ExecutionService {
  readonly #pending = new Map<string, PendingRun>();
  readonly #active = new Map<
    string,
    { controller: AbortController; done: Promise<void> }
  >();
  readonly #listeners = new Set<(run: Run) => void>();
  readonly #slots: Concurrency;
  #scheduled = false;
  #closed = false;
  #outputSequence = 0;

  constructor(
    private readonly actions: ActionRegistry,
    private readonly store: RunStore,
    concurrency = 4,
  ) {
    this.#slots = new Concurrency(concurrency);
  }

  submit(definition: ExecutionPlan, options: SubmitOptions = {}): Run {
    return this.submitBatch([{ definition, options }])[0]!;
  }

  /** 所有计划先校验，全部记录原子写入成功后才进入调度，避免多主机部分提交。 */
  submitBatch(
    items: { definition: ExecutionPlan; options: SubmitOptions }[],
  ): Run[] {
    if (this.#closed) throw new ConflictError('执行服务已关闭');
    if (this.#pending.size + this.#active.size + items.length > 512)
      throw new ConflictError('执行队列已满，请等待已有任务完成');
    const prepared = items.map(({ definition, options }) =>
      this.prepare(definition, options),
    );
    this.store.createMany(prepared);
    for (const item of prepared) this.#pending.set(item.run.id, item);
    this.schedule();
    return prepared.map(({ run }) => structuredClone(run));
  }

  private prepare(
    definition: ExecutionPlan,
    options: SubmitOptions,
  ): PendingRun {
    const plan = structuredClone(definition);
    this.validate(plan);
    const { input, issues } = resolveTaskInput(
      TaskParameters.parse(plan.parameters ?? []),
      options.input,
    );
    if (issues.length)
      throw new ValidationError(
        '任务参数不符合定义',
        issues.map((issue) => ({
          path: ['input', issue.name],
          message: issue.message,
        })),
      );
    const dependsOn = [...new Set(options.dependsOn ?? [])];
    // 依赖只能指向已存在的 Run，且提交后不可修改，因此不会引入跨 Run 的环。
    for (const id of dependsOn) {
      if (!this.store.get(id))
        throw new InvalidReferenceError(`依赖的执行 ${id} 不存在或已过期`);
    }
    const run: Run = {
      ...initialState(),
      id: randomUUID(),
      task: plan.task,
      input,
      sessionId: options.sessionId ?? null,
      source: options.source ?? 'internal',
      target: plan.target,
      retention: options.sessionId ? 'persistent' : 'memory',
      ...(options.parentRunId ? { parentRunId: options.parentRunId } : {}),
      ...(options.requestId ? { requestId: options.requestId } : {}),
      ...(options.requestHash ? { requestHash: options.requestHash } : {}),
      ...(plan.taskId ? { taskId: plan.taskId } : {}),
      ...(plan.taskRevision !== undefined
        ? { taskRevision: plan.taskRevision }
        : {}),
      ...(plan.targetName ? { targetName: plan.targetName } : {}),
      ...(plan.skippedSteps ? { skippedSteps: plan.skippedSteps } : {}),
      createdAt: this.now(),
      dependsOn,
      phase: 'before',
      hooks: this.makeHooks(plan.hooks),
      steps: plan.steps.map((step) => ({
        ...initialState(),
        id: step.id,
        title: step.title,
        action: step.action,
        input: step.input ?? null,
        dependsOn: [...(step.dependsOn ?? [])],
        phase: 'before',
        hooks: this.makeHooks(step.hooks),
      })),
      output: [],
      outputTruncated: false,
    };
    return { run, plan, controller: new AbortController() };
  }

  get(id: string): Run {
    const run = this.store.get(id);
    if (!run) throw new NotFoundError('执行不存在或临时记录已过期');
    return run;
  }

  tree(id: string): RunTree {
    return {
      run: this.get(id),
      children: this.store.children(id).map((child) => this.tree(child.id)),
    };
  }

  cancel(id: string): Run {
    const pending = this.#pending.get(id);
    const reason = new ExecutionFailure('cancelled', '用户取消了执行');
    if (pending) {
      pending.controller.abort(reason);
      this.finishUnstarted(pending.run, 'cancelled', executionError(reason));
      this.#pending.delete(id);
    } else {
      this.#active.get(id)?.controller.abort(reason);
    }
    return this.get(id);
  }

  /** 观察者用于通知；其异常不能改变执行成败。业务扩展使用 hooks。 */
  subscribe(listener: (run: Run) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  async close(): Promise<void> {
    this.#closed = true;
    for (const id of [...this.#pending.keys(), ...this.#active.keys()])
      this.cancel(id);
    await Promise.all([...this.#active.values()].map((item) => item.done));
    this.store.flush();
    this.#listeners.clear();
  }

  private now(): string {
    return new Date().toISOString();
  }

  private publish(run: Run): void {
    this.store.save(run);
    for (const listener of this.#listeners) {
      try {
        listener(structuredClone(run));
      } catch {
        /* 通知不参与业务成败。 */
      }
    }
    this.schedule();
  }

  private schedule(): void {
    if (this.#scheduled || this.#closed) return;
    this.#scheduled = true;
    queueMicrotask(() => {
      this.#scheduled = false;
      this.dispatch();
    });
  }

  private dispatch(): void {
    if (this.#closed) return;
    for (const [id, pending] of this.#pending) {
      const dependencies = pending.run.dependsOn.map((dep) =>
        this.store.get(dep),
      );
      if (
        dependencies.some(
          (dep) =>
            !dep ||
            (isExecutionFinished(dep.status) && dep.status !== 'succeeded'),
        )
      ) {
        this.#pending.delete(id);
        this.finishUnstarted(pending.run, 'blocked', {
          code: 'dependency_failed',
          message: '前置执行未成功，当前执行已阻塞',
        });
      } else if (dependencies.every((dep) => dep?.status === 'succeeded')) {
        this.#pending.delete(id);
        // 先登记 active，再发布 running；观察者可以在首个事件中取消。
        const done = Promise.resolve()
          .then(() => this.execute(pending))
          .finally(() => {
            this.#active.delete(id);
            this.schedule();
          });
        this.#active.set(id, { controller: pending.controller, done });
      }
    }
  }

  private async execute({ run, plan, controller }: PendingRun): Promise<void> {
    await this.lifecycle(run, run, plan.hooks, controller.signal, async () => {
      await this.executeSteps(run, plan, controller.signal);
      return Object.fromEntries(
        run.steps.map((step) => [step.id, step.result]),
      );
    });
  }

  private async executeSteps(
    run: Run,
    plan: ExecutionPlan,
    signal: AbortSignal,
  ): Promise<void> {
    const pending = new Set(run.steps.map((step) => step.id));
    const active = new Map<string, Promise<void>>();
    while (pending.size || active.size) {
      for (const step of run.steps) {
        if (!pending.has(step.id)) continue;
        const dependencies = step.dependsOn.map((id) =>
          run.steps.find((s) => s.id === id)!,
        );
        if (
          signal.aborted ||
          dependencies.some(
            (dep) =>
              isExecutionFinished(dep.status) &&
              dep.status !== 'succeeded' &&
              dep.status !== 'skipped',
          )
        ) {
          pending.delete(step.id);
          this.end(step, signal.aborted ? 'cancelled' : 'blocked');
          this.publish(run);
        } else if (
          dependencies.every(
            (dep) => dep.status === 'succeeded' || dep.status === 'skipped',
          )
        ) {
          pending.delete(step.id);
          const definition = plan.steps.find((s) => s.id === step.id)!;
          if (definition.skip) {
            this.end(step, 'skipped');
            this.publish(run);
            continue;
          }
          const done = this.lifecycle(run, step, definition.hooks, signal, () =>
            this.invoke(run, step.id, null, definition, signal),
          )
            .catch((error: unknown) => {
              step.errors.push(executionError(error));
              this.end(step, this.failureStatus(step.errors));
              this.publish(run);
            })
            .finally(() => {
              active.delete(step.id);
            });
          active.set(step.id, done);
        }
      }
      if (active.size) await Promise.race(active.values());
    }
    const failed = run.steps.find(
      (step) => step.status === 'failed' || step.status === 'interrupted',
    );
    if (failed) {
      throw new ExecutionFailure(
        failed.status === 'interrupted' ? 'interrupted' : 'step_failed',
        `步骤「${failed.title}」失败：${failed.errors[0]?.message ?? '执行失败'}`,
      );
    }
    checkAborted(signal);
    if (
      run.steps.some(
        (step) => step.status !== 'succeeded' && step.status !== 'skipped',
      )
    )
      throw new ExecutionFailure('step_blocked', '部分步骤未能完成');
  }

  private async lifecycle(
    run: Run,
    owner: Run | StepExecution,
    hooks: Hooks | undefined,
    signal: AbortSignal,
    body: () => Promise<unknown>,
  ): Promise<void> {
    owner.status = 'running';
    owner.startedAt = this.now();
    this.publish(run);
    try {
      owner.phase = 'before';
      await this.hooks(run, owner, hooks, 'before', signal);
      checkAborted(signal);
      owner.phase = 'body';
      this.publish(run);
      owner.result = structuredClone(await body());
      checkAborted(signal);
      owner.phase = 'afterSuccess';
      this.publish(run);
      await this.hooks(run, owner, hooks, 'afterSuccess', signal);
    } catch (error) {
      owner.errors.push(executionError(error));
    } finally {
      owner.phase = 'finally';
      this.publish(run);
      // 收尾不沿用已取消的 signal；每个 finally hook 仍有独立的有限超时。
      await this.hooks(
        run,
        owner,
        hooks,
        'finally',
        new AbortController().signal,
      );
      if (
        signal.aborted &&
        !owner.errors.some((error) => error.code === 'cancelled')
      ) {
        owner.errors.push({ code: 'cancelled', message: '用户取消了执行' });
      }
      if (owner === run) {
        // Run before 失败时步骤尚未启动；终态事件中的子节点也应全部结束。
        for (const step of run.steps) {
          if (!isExecutionFinished(step.status))
            this.end(step, signal.aborted ? 'cancelled' : 'blocked');
        }
      }
      this.end(
        owner,
        owner.errors.length ? this.failureStatus(owner.errors) : 'succeeded',
      );
      this.publish(run);
    }
  }

  private async hooks(
    run: Run,
    owner: Run | StepExecution,
    hooks: Hooks | undefined,
    phase: HookPhase,
    signal: AbortSignal,
  ): Promise<void> {
    for (const definition of hooks?.[phase] ?? []) {
      const record = owner.hooks.find(
        (hook) => hook.phase === phase && hook.key === definition.key,
      )!;
      const execute = async () => {
        record.status = 'running';
        record.startedAt = this.now();
        this.publish(run);
        try {
          record.result = structuredClone(
            await this.invoke(
              run,
              owner === run ? null : owner.id,
              record.id,
              {
                ...definition,
                timeoutMs:
                  definition.timeoutMs ??
                  (phase === 'finally' ? 5_000 : 30_000),
              },
              signal,
            ),
          );
          this.end(record, 'succeeded');
        } catch (error) {
          record.errors.push(executionError(error));
          this.end(record, this.failureStatus(record.errors));
          throw error;
        } finally {
          this.publish(run);
        }
      };
      try {
        await execute();
      } catch (error) {
        if (phase !== 'finally') throw error;
        owner.errors.push(executionError(error));
      }
    }
  }

  private async invoke(
    run: Run,
    stepId: string | null,
    hookId: string | null,
    call: ActionCall,
    signal: AbortSignal,
  ): Promise<unknown> {
    // 编排节点不占 SSH 并发槽，否则并发为 1 时父任务会等待拿不到槽的子任务。
    return call.task
      ? this.invokeCall(run, stepId, hookId, call, signal)
      : this.#slots.use(signal, () =>
          this.invokeCall(run, stepId, hookId, call, signal),
        );
  }

  private async invokeCall(
    run: Run,
    stepId: string | null,
    hookId: string | null,
    call: ActionCall,
    parentSignal: AbortSignal,
  ): Promise<unknown> {
    checkAborted(parentSignal);
    const controller = new AbortController();
    const abort = () => {
      controller.abort(parentSignal.reason);
    };
    parentSignal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(
      () => controller.abort(new ExecutionFailure('timeout', '执行超时')),
      call.timeoutMs ?? 30_000,
    );
    timer.unref();
    try {
      const owner =
        stepId === null ? run : run.steps.find((step) => step.id === stepId)!;
      if (call.task) {
        const child = this.prepare(call.task.plan, {
          input: call.task.input,
          sessionId: run.sessionId,
          source: 'task.reference',
          parentRunId: run.id,
        });
        this.store.createMany([child]);
        const record = hookId
          ? owner.hooks.find((hook) => hook.id === hookId)!
          : owner;
        if (record === run) throw new Error('嵌套任务必须属于步骤或钩子');
        (record as StepExecution | HookExecution).childRunId = child.run.id;
        this.publish(run);
        const cancelChild = () =>
          child.controller.abort(controller.signal.reason);
        controller.signal.addEventListener('abort', cancelChild, {
          once: true,
        });
        if (controller.signal.aborted) cancelChild();
        const done = Promise.resolve()
          .then(() => this.execute(child))
          .finally(() => this.#active.delete(child.run.id));
        this.#active.set(child.run.id, { controller: child.controller, done });
        try {
          await done;
        } finally {
          controller.signal.removeEventListener('abort', cancelChild);
        }
        checkAborted(controller.signal);
        if (child.run.status !== 'succeeded')
          throw new ExecutionFailure(
            'child_task_failed',
            `子任务「${child.run.task}」未成功：${child.run.errors[0]?.message ?? child.run.status}`,
          );
        return { childRunId: child.run.id };
      }
      const result = await this.actions
        .get(call.action)
        .execute(call.input ?? null, {
          taskInput: structuredClone(
            call.usesInputs
              ? Object.fromEntries(
                  Object.entries(run.input).filter(([name]) =>
                    call.usesInputs!.includes(name),
                  ),
                )
              : run.input,
          ),
          runId: run.id,
          stepId,
          target: structuredClone(run.target),
          signal: controller.signal,
          lifecycle: structuredClone({
            phase: owner.phase,
            result: owner.result,
            errors: owner.errors,
          }),
          results: structuredClone(
            Object.fromEntries(
              run.steps
                .filter((s) => s.status === 'succeeded')
                .map((s) => [s.id, s.result]),
            ),
          ),
          output: (stream, text) => {
            if (controller.signal.aborted || isExecutionFinished(run.status))
              return;
            // 同一执行树共用时序，合并父子输出时不依赖毫秒时间戳的精度。
            const sequence = ++this.#outputSequence;
            run.output.push({
              sequence,
              at: this.now(),
              stepId,
              hookId,
              stream,
              text: text.slice(-16_384),
            });
            if (text.length > 16_384) run.outputTruncated = true;
            while (
              run.output.length > (run.sessionId ? 512 : 128) ||
              run.output.reduce((n, item) => n + item.text.length, 0) >
                (run.sessionId ? 262_144 : 32_768)
            ) {
              run.output.shift();
              run.outputTruncated = true;
            }
            this.publish(run);
          },
        });
      checkAborted(controller.signal);
      return result;
    } finally {
      clearTimeout(timer);
      parentSignal.removeEventListener('abort', abort);
    }
  }

  private failureStatus(errors: ExecutionError[]): ExecutionStatus {
    if (
      errors.some(
        (error) => error.code !== 'cancelled' && error.code !== 'interrupted',
      )
    )
      return 'failed';
    return errors.some((error) => error.code === 'interrupted')
      ? 'interrupted'
      : 'cancelled';
  }

  private end(state: ExecutionState, status: ExecutionStatus): void {
    state.status = status;
    state.finishedAt = this.now();
    if ('hooks' in state) {
      (state as Run | StepExecution).phase = 'finished';
      for (const hook of (state as Run | StepExecution).hooks) {
        if (hook.status === 'queued') this.end(hook, 'skipped');
      }
    }
  }

  private finishUnstarted(
    run: Run,
    status: ExecutionStatus,
    error: ExecutionError,
  ): void {
    run.errors.push(error);
    for (const step of run.steps) this.end(step, status);
    this.end(run, status);
    this.publish(run);
  }

  private makeHooks(hooks?: Hooks): HookExecution[] {
    return PHASES.flatMap((phase) =>
      (hooks?.[phase] ?? []).map((hook) => ({
        ...initialState(),
        id: randomUUID(),
        key: hook.key,
        phase,
        action: hook.action,
      })),
    );
  }

  private validate(plan: ExecutionPlan): void {
    if (!plan.steps.length || plan.steps.length > 64)
      throw new Error('任务必须包含 1–64 个步骤');
    const calls = (call: ActionCall) => {
      if (call.task) this.validate(call.task.plan);
      else if (call.action !== 'task.skipped') this.actions.get(call.action);
      if (
        call.timeoutMs !== undefined &&
        (!Number.isInteger(call.timeoutMs) ||
          call.timeoutMs < 1 ||
          call.timeoutMs > 3_600_000)
      )
        throw new Error('执行超时必须在 1–3600000 毫秒之间');
    };
    const hooks = (definitions?: Hooks) => {
      for (const phase of PHASES) {
        const keys = new Set<string>();
        for (const hook of definitions?.[phase] ?? []) {
          if (keys.has(hook.key)) throw new Error(`钩子 ${hook.key} 重复`);
          keys.add(hook.key);
          calls(hook);
        }
      }
    };
    hooks(plan.hooks);
    const byId = new Map(plan.steps.map((step) => [step.id, step]));
    if (byId.size !== plan.steps.length) throw new Error('步骤 id 不能重复');
    const visiting = new Set<string>(),
      visited = new Set<string>();
    const visit = (id: string) => {
      if (visiting.has(id)) throw new Error('步骤依赖不能形成环');
      if (visited.has(id)) return;
      const step = byId.get(id);
      if (!step) throw new Error(`依赖的步骤 ${id} 不存在`);
      visiting.add(id);
      calls(step);
      hooks(step.hooks);
      for (const dependency of step.dependsOn ?? []) visit(dependency);
      visiting.delete(id);
      visited.add(id);
    };
    for (const id of byId.keys()) visit(id);
  }
}
