import { z } from 'zod';
import { auditFields, Description, DisplayName, ResourceId } from './fields';
import { SshScriptInput } from './ssh-script';
import { TaskInput, TaskParameters, TaskParameterName } from './task-input';
import { TaskInputBindings } from './task-input-bindings';
import { TaskPlacement } from './task-placement';

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
        input: SshScriptInput,
        /** 未声明时保守视为使用全部参数；空数组表示不使用任务参数。 */
        usesInputs: z.array(TaskParameterName).max(32).optional(),
      })
      .strict(),
  ]),
  z
    .object({
      kind: z.literal('task'),
      taskId: ResourceId,
      input: TaskInput.optional(),
      inputBindings: TaskInputBindings.optional(),
    })
    .strict()
    .superRefine((call, ctx) => {
      for (const name of Object.keys(call.inputBindings ?? {}))
        if (call.input?.[name] !== undefined)
          ctx.addIssue({
            code: 'custom',
            path: ['inputBindings', name],
            message: '同一参数不能同时设置固定值和绑定',
          });
    }),
]);
export type TaskCall = z.output<typeof TaskCall>;

export const TaskHook = z
  .object({
    key: NodeKey,
    title: DisplayName,
    call: TaskCall,
    placement: TaskPlacement.optional(),
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
    placement: TaskPlacement.optional(),
    dependsOn: z.array(NodeKey).max(63).default([]),
    // 声明 Session 是否允许用户跳过，不代表本次已经选择跳过。
    skippable: z.boolean().default(false),
    timeoutMs: Timeout.default(60_000),
    hooks: TaskHooks.default(emptyTaskHooks),
  })
  .strict();
export type TaskStep = z.output<typeof TaskStep>;

/** 可复用的任务定义，不包含主机、Session、Run 或任何执行状态。 */
export const TaskDefinition = z
  .object({
    schemaVersion: z.literal(1).default(1),
    execution: z.enum(['perHost', 'orchestrated']).optional(),
    parameters: TaskParameters.default([]),
    steps: z
      .array(TaskStep)
      .min(1, '请至少添加一个步骤')
      .max(64, '最多 64 个步骤'),
    hooks: TaskHooks.default(emptyTaskHooks),
  })
  .strict()
  .superRefine((definition, ctx) => {
    const ancestors = (id: string, seen = new Set<string>()): Set<string> => {
      if (seen.has(id)) return seen;
      seen.add(id);
      for (const dep of definition.steps.find((step) => step.id === id)
        ?.dependsOn ?? [])
        ancestors(dep, seen);
      return seen;
    };
    const checkCall = (call: TaskCall, ownerId?: string) => {
      if (call.kind !== 'task') return;
      for (const binding of Object.values(call.inputBindings ?? {})) {
        if (binding.from !== 'stepResult') continue;
        if (
          !ownerId ||
          binding.stepId === ownerId ||
          !ancestors(ownerId).has(binding.stepId)
        )
          ctx.addIssue({
            code: 'custom',
            message:
              '读取步骤结果必须显式依赖该步骤；任务钩子不支持步骤结果绑定',
          });
      }
    };
    for (const step of definition.steps) {
      const placement = step.placement;
      if (
        definition.execution !== 'orchestrated' &&
        placement &&
        placement.kind !== 'each'
      )
        ctx.addIssue({
          code: 'custom',
          message: '选择单个目标或动态目标需要启用跨主机协作执行',
        });
      if (
        placement?.kind === 'input' &&
        !definition.parameters.some(
          (p) => p.name === placement.key && p.type === 'string',
        )
      )
        ctx.addIssue({
          code: 'custom',
          message: '执行位置需要绑定已声明的文本参数（主机 ID）',
        });
      if (
        placement?.kind === 'result' &&
        (placement.stepId === step.id ||
          !ancestors(step.id).has(placement.stepId))
      )
        ctx.addIssue({
          code: 'custom',
          message: '按结果选择主机必须显式依赖提供结果的步骤',
        });
      checkCall(step.call, step.id);
      for (const hook of Object.values(step.hooks).flat()) {
        checkCall(hook.call, step.id);
        if (
          hook.placement?.kind === 'result' &&
          (hook.placement.stepId === step.id ||
            !ancestors(step.id).has(hook.placement.stepId))
        )
          ctx.addIssue({
            code: 'custom',
            message: '钩子目标必须来自依赖步骤的结果',
          });
      }
    }
    for (const hook of Object.values(definition.hooks).flat()) {
      checkCall(hook.call);
      if (hook.placement?.kind === 'result')
        ctx.addIssue({
          code: 'custom',
          message: '任务钩子请使用固定的执行位置',
        });
    }
    for (const hook of [
      ...Object.values(definition.hooks).flat(),
      ...definition.steps.flatMap((step) => Object.values(step.hooks).flat()),
    ]) {
      if (hook.placement?.kind === 'input') {
        const key = hook.placement.key;
        if (
          !definition.parameters.some(
            (p) => p.name === key && p.type === 'string',
          )
        )
          ctx.addIssue({
            code: 'custom',
            message: '钩子执行位置需要绑定已声明的文本参数',
          });
      }
      if (
        definition.execution !== 'orchestrated' &&
        hook.placement &&
        hook.placement.kind !== 'each'
      )
        ctx.addIssue({
          code: 'custom',
          message: '钩子指定执行位置需要启用跨主机协作执行',
        });
    }
    for (const call of taskCalls(definition)) {
      if (call.kind !== 'action' || call.action !== 'ssh.exec') continue;
      for (const name of call.usesInputs ?? [])
        if (!definition.parameters.some((parameter) => parameter.name === name))
          ctx.addIssue({
            code: 'custom',
            message: `脚本使用了未声明的参数「${name}」`,
          });
    }
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

export const TaskLabels = z
  .array(
    z
      .string()
      .trim()
      .min(1, '标签不能为空')
      .max(32, '标签最多 32 个字符')
      .regex(/^\S+$/, '标签不能包含空格'),
  )
  .max(20, '最多 20 个标签')
  .refine((labels) => new Set(labels).size === labels.length, '标签不能重复');

const taskFields = {
  name: DisplayName,
  description: Description.default(''),
  labels: TaskLabels.default([]),
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
export const taskCalls = (definition: TaskDefinition): TaskCall[] => {
  const hooks = (value: TaskHooks) =>
    TASK_HOOK_PHASES.flatMap((phase) => value[phase].map((hook) => hook.call));
  return [
    ...hooks(definition.hooks),
    ...definition.steps.flatMap((step) => [step.call, ...hooks(step.hooks)]),
  ];
};
export const taskReferences = (definition: TaskDefinition): string[] => {
  return [
    ...new Set(
      taskCalls(definition).flatMap((call) =>
        call.kind === 'task' ? [call.taskId] : [],
      ),
    ),
  ];
};
