import { z } from 'zod';
import { auditFields, DisplayName, ResourceId } from './fields';
import { TaskInput } from './task-input';
import type { Run } from './execution';
import { TargetSelection } from './execution-target';

export const SkippedSteps = z
  .array(z.string().min(1).max(2048))
  .max(512)
  .refine(
    (items) => new Set(items).size === items.length,
    '不能重复选择跳过步骤',
  );
export const SessionDraft = z
  .object({
    taskId: ResourceId.nullable().default(null),
    /** 选择目标时确认的主机名单；旧草稿没有 targetSelection 时按单独主机解释。 */
    hostIds: z.array(ResourceId).max(32).default([]),
    targetSelection: TargetSelection.optional(),
    fields: z.record(z.string(), z.string()).default({}),
    skippedSteps: SkippedSteps.default([]),
    dependsOn: z.array(ResourceId).max(32).default([]),
  })
  .strict()
  .refine((draft) => JSON.stringify(draft).length <= 64_000, '会话配置过大');
export type SessionDraft = z.output<typeof SessionDraft>;
export const CreateSessionInput = z.object({ title: DisplayName }).strict();
export type CreateSessionInput = z.output<typeof CreateSessionInput>;
export const UpdateSessionInput = z
  .object({
    title: DisplayName.optional(),
    draft: SessionDraft.optional(),
    revision: z.number().int().positive(),
  })
  .strict();
export type UpdateSessionInput = z.output<typeof UpdateSessionInput>;
export const Session = z.object({
  id: ResourceId,
  title: DisplayName,
  draft: SessionDraft,
  revision: z.number().int().positive(),
  ...auditFields,
});
export type Session = z.output<typeof Session>;
export type SessionSummary = Omit<Session, 'draft'>;

export const ExecuteSessionTask = z
  .object({
    requestId: ResourceId,
    taskId: ResourceId,
    /** 前端看到的全部引用版本；编译前检查，防止静默执行刚被修改的脚本。 */
    taskRevisions: z.record(ResourceId, z.number().int().positive()),
    targetSelection: TargetSelection.optional(),
    /** 用户预览的主机名单；指定集群时服务端重新解析，并核对名单没有变化。 */
    hostIds: z
      .array(ResourceId)
      .min(1, '请选择主机')
      .max(32)
      .refine((ids) => new Set(ids).size === ids.length, '主机不能重复'),
    input: TaskInput.default({}),
    skippedSteps: SkippedSteps.default([]),
    dependsOn: z.array(ResourceId).max(32).default([]),
  })
  .strict();
export type ExecuteSessionTask = z.output<typeof ExecuteSessionTask>;
export type SessionRunSummary = Pick<
  Run,
  | 'id'
  | 'requestId'
  | 'task'
  | 'status'
  | 'createdAt'
  | 'startedAt'
  | 'finishedAt'
  | 'errors'
  | 'targetName'
  | 'targetScope'
  | 'taskRevision'
  | 'dependsOn'
>;
export interface SessionRunPage {
  items: SessionRunSummary[];
  nextCursor: string | null;
}
export interface RunTree {
  run: Run;
  children: RunTree[];
}
