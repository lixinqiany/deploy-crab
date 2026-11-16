import { z } from 'zod';
import { auditFields, Description, DisplayName, ResourceId } from './fields';

export const TASK_ACTIONS = [
  {
    key: 'ssh.probe',
    name: '检查 SSH 连通性',
    description: '确认可以登录目标主机并执行远程命令。',
    editor: 'builtin',
  },
  {
    key: 'ssh.exec',
    name: '执行 Shell 脚本',
    description: '在目标主机运行自定义脚本，每一步使用独立的 Shell。',
    editor: 'script',
  },
] as const;

export const TASK_HOOK_PHASES = ['before', 'afterSuccess', 'finally'] as const;
export type TaskHookPhase = (typeof TASK_HOOK_PHASES)[number];
export const TASK_HOOK_LABELS: Record<TaskHookPhase, string> = {
  before: '执行前',
  afterSuccess: '成功后',
  finally: '结束时（无论成败）',
};

const NodeKey = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[A-Za-z][A-Za-z0-9_-]*$/,
    '标识只能包含字母、数字、短横线和下划线，并以字母开头',
  );
const Timeout = z
  .number()
  .int()
  .min(1000, '超时至少 1 秒')
  .max(3_600_000, '超时最多 1 小时');

/** 编辑器只保存调用数据；脚本也是 Action，任务引用不会嵌入另一个任务的副本。 */
export const TaskCall = z.discriminatedUnion('kind', [
  z.discriminatedUnion('action', [
    z
      .object({
        kind: z.literal('action'),
        action: z.literal('ssh.probe'),
        input: z.object({}).strict().default({}),
      })
      .strict(),
    z
      .object({
        kind: z.literal('action'),
        action: z.literal('ssh.exec'),
        input: z
          .object({
            script: z
              .string()
              .max(16_000, '脚本最多 16000 个字符')
              .refine((s) => s.trim().length > 0, '请填写脚本'),
            shell: z.enum(['bash', 'sh']).default('bash'),
            cwd: z
              .string()
              .trim()
              .min(1, '工作目录不能为空')
              .max(1024)
              .nullable()
              .default(null),
          })
          .strict(),
      })
      .strict(),
  ]),
  z.object({ kind: z.literal('task'), taskId: ResourceId }).strict(),
]);
export type TaskCall = z.output<typeof TaskCall>;

export const TaskHook = z
  .object({
    key: NodeKey,
    title: DisplayName,
    call: TaskCall,
    timeoutMs: Timeout.default(30_000),
  })
  .strict();
export type TaskHook = z.output<typeof TaskHook>;

export const TaskHooks = z
  .object({
    before: z.array(TaskHook).max(8).default([]),
    afterSuccess: z.array(TaskHook).max(8).default([]),
    finally: z.array(TaskHook).max(8).default([]),
  })
  .strict()
  .superRefine((hooks, ctx) => {
    for (const phase of TASK_HOOK_PHASES) {
      const seen = new Set<string>();
      hooks[phase].forEach((hook, i) => {
        if (seen.has(hook.key))
          ctx.addIssue({
            code: 'custom',
            path: [phase, i, 'key'],
            message: '同一阶段的钩子标识不能重复',
          });
        seen.add(hook.key);
      });
    }
  });
export type TaskHooks = z.output<typeof TaskHooks>;
export const emptyTaskHooks = (): TaskHooks => ({
  before: [],
  afterSuccess: [],
  finally: [],
});

export const TaskStep = z
  .object({
    id: NodeKey,
    title: DisplayName,
    call: TaskCall,
    dependsOn: z.array(NodeKey).max(63).default([]),
    timeoutMs: Timeout.default(60_000),
    hooks: TaskHooks.default(emptyTaskHooks),
  })
  .strict();
export type TaskStep = z.output<typeof TaskStep>;

/** 可复用的任务定义，不包含主机、Session、Run 或任何执行状态。 */
export const TaskDefinition = z
  .object({
    schemaVersion: z.literal(1).default(1),
    steps: z
      .array(TaskStep)
      .min(1, '请至少添加一个步骤')
      .max(64, '最多 64 个步骤'),
    hooks: TaskHooks.default(emptyTaskHooks),
  })
  .strict()
  .superRefine((definition, ctx) => {
    const byId = new Map<string, TaskStep>();
    definition.steps.forEach((step, index) => {
      if (byId.has(step.id))
        ctx.addIssue({
          code: 'custom',
          path: ['steps', index, 'id'],
          message: '步骤标识不能重复',
        });
      byId.set(step.id, step);
    });
    definition.steps.forEach((step, index) => {
      if (new Set(step.dependsOn).size !== step.dependsOn.length)
        ctx.addIssue({
          code: 'custom',
          path: ['steps', index, 'dependsOn'],
          message: '不能重复依赖同一步骤',
        });
      if (step.dependsOn.some((id) => !byId.has(id)))
        ctx.addIssue({
          code: 'custom',
          path: ['steps', index, 'dependsOn'],
          message: '依赖的步骤不存在',
        });
    });
    const visiting = new Set<string>(),
      visited = new Set<string>();
    const cyclic = (id: string): boolean => {
      if (visiting.has(id)) return true;
      if (visited.has(id)) return false;
      visiting.add(id);
      if (byId.get(id)?.dependsOn.some(cyclic)) return true;
      visiting.delete(id);
      visited.add(id);
      return false;
    };
    if (definition.steps.some((step) => cyclic(step.id)))
      ctx.addIssue({
        code: 'custom',
        path: ['steps'],
        message: '步骤依赖不能形成循环',
      });
    if (JSON.stringify(definition).length > 24_000)
      ctx.addIssue({
        code: 'custom',
        message: '任务定义过大，请拆成可复用的子任务（最多 24000 个字符）',
      });
  })
  .meta({ id: 'TaskDefinition' });
export type TaskDefinition = z.output<typeof TaskDefinition>;

const taskFields = {
  name: DisplayName,
  description: Description.default(''),
  sourceUrl: z
    .url({ protocol: /^https?$/ })
    .max(2048)
    .nullable()
    .default(null),
  definition: TaskDefinition,
};
export const CreateTaskInput = z
  .object(taskFields)
  .strict()
  .meta({ id: 'CreateTaskInput' });
export type CreateTaskInput = z.output<typeof CreateTaskInput>;
export type CreateTaskBody = z.input<typeof CreateTaskInput>;
/** 完整替换定义，revision 防止多窗口编辑互相覆盖。 */
export const UpdateTaskInput = CreateTaskInput.extend({
  revision: z.number().int().positive(),
}).meta({ id: 'UpdateTaskInput' });
export type UpdateTaskInput = z.output<typeof UpdateTaskInput>;
export type UpdateTaskBody = z.input<typeof UpdateTaskInput>;
export const Task = z
  .object({
    id: ResourceId,
    ...taskFields,
    revision: z.number().int().positive(),
    ...auditFields,
  })
  .meta({ id: 'Task' });
export type Task = z.output<typeof Task>;

export interface TaskTemplate {
  id: string;
  title: string;
  summary: string;
  task: CreateTaskInput;
}
export interface TaskCatalog {
  actions: typeof TASK_ACTIONS;
  templates: TaskTemplate[];
}

/** 包含任务钩子和步骤钩子，引用检查与删除保护使用同一份遍历规则。 */
export const taskReferences = (definition: TaskDefinition): string[] => {
  const hooks = (value: TaskHooks) =>
    TASK_HOOK_PHASES.flatMap((phase) => value[phase].map((hook) => hook.call));
  const calls = [
    ...hooks(definition.hooks),
    ...definition.steps.flatMap((step) => [step.call, ...hooks(step.hooks)]),
  ];
  return [
    ...new Set(
      calls.flatMap((call) => (call.kind === 'task' ? [call.taskId] : [])),
    ),
  ];
};
