import { createHash, randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import {
  Session,
  SessionDraft,
  type CreateSessionInput,
  type UpdateSessionInput,
  type ExecuteSessionTask,
  type SessionSummary,
} from '@deploy-crab/contracts/session';
import { configureTask } from '@deploy-crab/contracts/task-configuration';
import { CheckHostInput } from '@deploy-crab/contracts/connection';
import type { Database } from '../database/database';
import { sessions } from '../database/tables/sessions';
import { TaskRepository } from '../tasks/task-repository';
import { HostRepository } from '../inventory/host-repository';
import { ClusterRepository } from '../inventory/cluster-repository';
import { resolveTargetSelection } from '@deploy-crab/contracts/execution-target';
import {
  ConflictError,
  NotFoundError,
  InvalidReferenceError,
  ValidationError,
} from '../errors/domain-error';
import type { ExecutionService } from '../execution/execution-service';
import type { PersistentRunStore } from '../execution/persistent-run-store';
import { ConnectionResolver } from '../ssh/connection-resolver';
import { compileStoredTask } from '../tasks/stored-task-planner';

export class SessionService {
  constructor(
    private readonly database: Database,
    private readonly execution: ExecutionService,
    private readonly store: PersistentRunStore,
  ) {}
  list(): SessionSummary[] {
    return this.database.read((tx) =>
      tx
        .select({
          id: sessions.id,
          title: sessions.title,
          revision: sessions.revision,
          createdAt: sessions.createdAt,
          updatedAt: sessions.updatedAt,
        })
        .from(sessions)
        .orderBy(desc(sessions.updatedAt), desc(sessions.id))
        .all(),
    );
  }
  get(id: string): Session {
    const row = this.database.read((tx) =>
      tx.select().from(sessions).where(eq(sessions.id, id)).get(),
    );
    if (!row) throw new NotFoundError('会话不存在或已删除');
    return Session.parse(row);
  }
  create(input: CreateSessionInput): Session {
    const now = new Date().toISOString();
    const session: Session = {
      id: randomUUID(),
      title: input.title,
      draft: SessionDraft.parse({}),
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.database.write((tx) => tx.insert(sessions).values(session).run());
    return session;
  }
  update(id: string, input: UpdateSessionInput): Session {
    return this.database.write((tx) => {
      const current = this.get(id);
      if (current.revision !== input.revision)
        throw new ConflictError('会话已在其他窗口修改，请重新加载后再编辑');
      const updated: Session = {
        ...current,
        title: input.title ?? current.title,
        draft: input.draft ?? current.draft,
        revision: current.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      tx.update(sessions).set(updated).where(eq(sessions.id, id)).run();
      return updated;
    });
  }
  delete(id: string): void {
    this.store.flush();
    this.database.write((tx) => {
      this.get(id);
      if (this.store.hasActive(id))
        throw new ConflictError('会话中还有执行未结束，请先取消或等待完成');
      tx.delete(sessions).where(eq(sessions.id, id)).run();
    });
  }
  history(id: string, before?: string, limit = 20) {
    this.get(id);
    return this.store.page(id, before, limit);
  }
  execute(id: string, request: ExecuteSessionTask) {
    this.get(id);
    const requestHash = createHash('sha256')
      .update(JSON.stringify(request))
      .digest('hex');
    const existing = this.store.requestRuns(id, request.requestId);
    if (existing.length) {
      if (existing.some((run) => run.requestHash !== requestHash))
        throw new ConflictError('同一提交标识不能用于不同的执行配置');
      return existing;
    }
    for (const dependency of request.dependsOn) {
      const run = this.execution.get(dependency);
      if (run.sessionId !== id || run.parentRunId)
        throw new InvalidReferenceError('前置执行必须是当前会话中的顶层任务');
    }
    const compiled = this.database.read((tx) => {
      const tasks = new TaskRepository(tx).list();
      const task = tasks.find((t) => t.id === request.taskId);
      if (!task) throw new NotFoundError('选择的任务不存在');
      let configuration;
      try {
        configuration = configureTask(task, tasks, request.skippedSteps);
      } catch (error) {
        throw new ValidationError(
          error instanceof Error ? error.message : '任务配置无效',
          [],
        );
      }
      for (const [taskId, revision] of Object.entries(configuration.revisions))
        if (request.taskRevisions[taskId] !== revision)
          throw new ConflictError(
            '任务或引用任务已修改，请刷新任务定义、检查配置后重新执行',
          );
      const hosts = new HostRepository(tx);
      const availableHosts = hosts.list();
      const availableIds = new Set(availableHosts.map((host) => host.id));
      if (request.hostIds.some((id) => !availableIds.has(id)))
        throw new NotFoundError('选择的主机已不存在');
      let targetScope;
      try {
        targetScope = resolveTargetSelection(
          request.targetSelection ?? {
            kind: 'hosts',
            hostIds: request.hostIds,
          },
          request.targetSelection?.kind === 'cluster'
            ? new ClusterRepository(tx).list()
            : [],
          availableHosts,
        );
      } catch (error) {
        throw new ValidationError(
          error instanceof Error ? error.message : '执行目标无效',
          [],
        );
      }
      if (
        targetScope.hostIds.length !== request.hostIds.length ||
        targetScope.hostIds.some((hostId) => !request.hostIds.includes(hostId))
      )
        throw new ConflictError(
          '集群成员或分组已变化，请重新选择执行目标，核对主机名单后再提交',
        );
      return targetScope.hostIds.map((hostId) => {
        const host = hosts.get(hostId);
        if (!host) throw new NotFoundError('选择的主机已不存在');
        const target = new ConnectionResolver(this.database).resolve(
          CheckHostInput.parse({ ...host, hostId }),
        );
        return {
          ...compileStoredTask(
            configuration.configured,
            target,
            host.name,
            request.input,
          ),
          targetScope,
        };
      });
    });
    const result = this.execution.submitBatch(
      compiled.map(({ plan, input, targetScope }) => ({
        definition: plan,
        options: {
          input,
          sessionId: id,
          source: 'session',
          requestId: request.requestId,
          requestHash,
          dependsOn: request.dependsOn,
          targetScope,
        },
      })),
    );
    this.database.write((tx) =>
      tx
        .update(sessions)
        .set({ updatedAt: new Date().toISOString() })
        .where(eq(sessions.id, id))
        .run(),
    );
    return result;
  }
}
