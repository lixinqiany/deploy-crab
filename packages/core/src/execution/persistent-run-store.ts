import { and, desc, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import {
  isExecutionFinished,
  type Run,
} from '@deploy-crab/contracts/execution';
import type { SessionRunPage } from '@deploy-crab/contracts/session';
import type { Database } from '../database/database';
import { runs } from '../database/tables/runs';
import { ConflictError, NotFoundError } from '../errors/domain-error';
import type { ExecutionPlan } from './definition';
import { MemoryRunStore, RunStore } from './run-store';

/** 临时检查仍走内存；Session 记录持久化，运行中快照合并写入，终态同步落盘。 */
export class PersistentRunStore extends RunStore {
  readonly #memory = new MemoryRunStore();
  readonly #live = new Map<string, Run>();
  readonly #dirty = new Map<string, Run>();
  #timer: ReturnType<typeof setTimeout> | undefined;
  #writeError: unknown;

  constructor(private readonly database: Database) {
    super();
    database.write((tx) => {
      const unfinished = tx
        .select()
        .from(runs)
        .where(inArray(runs.status, ['queued', 'running']))
        .all();
      const now = new Date().toISOString();
      for (const row of unfinished) {
        const run = row.snapshot;
        run.status = 'interrupted';
        run.phase = 'finished';
        run.finishedAt = now;
        run.errors.push({
          code: 'interrupted',
          message: '服务已重启，执行状态未知；请检查服务器后再决定是否重新执行',
        });
        for (const step of run.steps) {
          if (!isExecutionFinished(step.status)) {
            step.status = 'interrupted';
            step.phase = 'finished';
            step.finishedAt = now;
          }
          for (const hook of step.hooks)
            if (!isExecutionFinished(hook.status)) {
              hook.status = 'interrupted';
              hook.finishedAt = now;
            }
        }
        for (const hook of run.hooks)
          if (!isExecutionFinished(hook.status)) {
            hook.status = 'interrupted';
            hook.finishedAt = now;
          }
        tx.update(runs)
          .set({ status: run.status, snapshot: run })
          .where(eq(runs.id, run.id))
          .run();
      }
    });
  }

  get(id: string): Run | undefined {
    const cached = this.#live.get(id) ?? this.#memory.get(id);
    if (cached) return structuredClone(cached);
    return this.database.read(
      (tx) =>
        tx
          .select({ snapshot: runs.snapshot })
          .from(runs)
          .where(eq(runs.id, id))
          .get()?.snapshot,
    );
  }
  list(): Run[] {
    return [
      ...this.#memory.list(),
      ...this.database
        .read((tx) => tx.select({ snapshot: runs.snapshot }).from(runs).all())
        .map(({ snapshot }) =>
          structuredClone(this.#live.get(snapshot.id) ?? snapshot),
        ),
    ];
  }
  create(run: Run, plan?: ExecutionPlan): void {
    if (!plan) throw new Error('持久化执行必须提供计划快照');
    this.createMany([{ run, plan }]);
  }
  override createMany(items: { run: Run; plan: ExecutionPlan }[]): void {
    if (this.#writeError)
      throw new ConflictError('执行记录保存失败，请检查磁盘后重启服务');
    if (items.every(({ run }) => !run.sessionId)) {
      this.#memory.createMany(items);
      return;
    }
    if (items.some(({ run }) => !run.sessionId))
      throw new Error('不能混合提交临时与会话执行');
    this.database.write((tx) => {
      for (const { run, plan } of items)
        tx.insert(runs)
          .values({
            id: run.id,
            sessionId: run.sessionId!,
            parentRunId: run.parentRunId ?? null,
            requestId: run.requestId ?? null,
            status: run.status,
            createdAt: run.createdAt,
            snapshot: run,
            plan,
          })
          .run();
    });
    for (const { run } of items) this.#live.set(run.id, structuredClone(run));
  }
  save(run: Run): void {
    if (!run.sessionId) {
      this.#memory.save(run);
      return;
    }
    const snapshot = structuredClone(run);
    this.#live.set(run.id, snapshot);
    this.#dirty.set(run.id, snapshot);
    if (isExecutionFinished(run.status)) {
      this.flush();
      this.#live.delete(run.id);
    } else if (!this.#timer) {
      this.#timer = setTimeout(() => {
        this.#timer = undefined;
        try {
          this.flush();
        } catch (error) {
          this.#writeError = error;
        }
      }, 250);
      this.#timer.unref();
    }
  }
  override flush(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = undefined;
    if (!this.#dirty.size) return;
    this.database.write((tx) => {
      for (const run of this.#dirty.values())
        tx.update(runs)
          .set({ snapshot: run, status: run.status })
          .where(eq(runs.id, run.id))
          .run();
    });
    this.#dirty.clear();
    this.#writeError = undefined;
  }
  override children(id: string): Run[] {
    const persistent = this.database.read((tx) =>
      tx
        .select({ snapshot: runs.snapshot })
        .from(runs)
        .where(eq(runs.parentRunId, id))
        .orderBy(runs.createdAt, runs.id)
        .all(),
    );
    return [
      ...persistent.map(({ snapshot }) =>
        structuredClone(this.#live.get(snapshot.id) ?? snapshot),
      ),
      ...this.#memory.children(id),
    ];
  }
  requestRuns(sessionId: string, requestId: string): Run[] {
    return this.database
      .read((tx) =>
        tx
          .select({ snapshot: runs.snapshot })
          .from(runs)
          .where(
            and(
              eq(runs.sessionId, sessionId),
              eq(runs.requestId, requestId),
              isNull(runs.parentRunId),
            ),
          )
          .all(),
      )
      .map(({ snapshot }) =>
        structuredClone(this.#live.get(snapshot.id) ?? snapshot),
      );
  }
  hasActive(sessionId: string): boolean {
    return this.database.read(
      (tx) =>
        !!tx
          .select({ id: runs.id })
          .from(runs)
          .where(
            and(
              eq(runs.sessionId, sessionId),
              inArray(runs.status, ['queued', 'running']),
            ),
          )
          .limit(1)
          .get(),
    );
  }
  page(sessionId: string, before?: string, limit = 20): SessionRunPage {
    const cursor = before ? this.get(before) : undefined;
    if (
      before &&
      (!cursor || cursor.sessionId !== sessionId || cursor.parentRunId)
    )
      throw new NotFoundError('历史分页位置不存在');
    const rows = this.database.read((tx) =>
      tx
        .select({ snapshot: runs.snapshot })
        .from(runs)
        .where(
          and(
            eq(runs.sessionId, sessionId),
            isNull(runs.parentRunId),
            cursor
              ? or(
                  lt(runs.createdAt, cursor.createdAt),
                  and(
                    eq(runs.createdAt, cursor.createdAt),
                    lt(runs.id, cursor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(runs.createdAt), desc(runs.id))
        .limit(limit + 1)
        .all(),
    );
    const items = rows.slice(0, limit).map(({ snapshot }) => {
      const {
        id,
        task,
        status,
        createdAt,
        startedAt,
        finishedAt,
        errors,
        targetName,
        targetScope,
        taskRevision,
        dependsOn,
        requestId,
      } = this.#live.get(snapshot.id) ?? snapshot;
      return {
        id,
        task,
        status,
        createdAt,
        startedAt,
        finishedAt,
        errors,
        dependsOn,
        ...(requestId !== undefined ? { requestId } : {}),
        ...(targetName !== undefined ? { targetName } : {}),
        ...(targetScope !== undefined ? { targetScope } : {}),
        ...(taskRevision !== undefined ? { taskRevision } : {}),
      };
    });
    return { items, nextCursor: rows.length > limit ? items.at(-1)!.id : null };
  }
}
