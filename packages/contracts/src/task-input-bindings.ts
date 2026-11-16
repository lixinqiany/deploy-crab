import { z } from 'zod';
import { ResultPath, readResultPath } from './task-placement';
import {
  TaskParameterName,
  resolveTaskInput,
  type TaskInput,
  type TaskInputIssue,
  type TaskParameter,
} from './task-input';

/** 绑定与 JSON 固定值分开存放，避免把用户数据误当成表达式。 */
export const TaskInputBindings = z
  .record(
    TaskParameterName,
    z.discriminatedUnion('from', [
      z
        .object({ from: z.literal('taskInput'), key: TaskParameterName })
        .strict(),
      z
        .object({
          from: z.literal('stepResult'),
          stepId: z.string().min(1).max(64),
          path: ResultPath,
        })
        .strict(),
      z
        .object({
          from: z.literal('context'),
          key: z.enum(['target', 'targets']),
        })
        .strict(),
    ]),
  )
  .refine(
    (bindings) => Object.keys(bindings).length <= 32,
    '最多 32 个参数绑定',
  );
export type TaskInputBindings = z.output<typeof TaskInputBindings>;

export interface TaskInputMapping {
  input?: TaskInput | undefined;
  inputBindings?: TaskInputBindings | undefined;
}

export const canBindTaskParameter = (
  source: TaskParameter,
  target: TaskParameter,
): boolean =>
  !!source.secret === !!target.secret &&
  (target.type === 'json' || source.type === target.type);

/** 保存定义时只校验映射；绑定值尚未提供，必填校验留到实际调用时。 */
export function validateTaskInputMapping(
  parentParameters: TaskParameter[],
  childParameters: TaskParameter[],
  mapping: TaskInputMapping,
): { issues: TaskInputIssue[] } {
  const parsed = TaskInputBindings.safeParse(mapping.inputBindings ?? {});
  if (!parsed.success)
    return {
      issues: parsed.error.issues.map((issue) => ({
        name: typeof issue.path[0] === 'string' ? issue.path[0] : '',
        message: issue.message,
      })),
    };
  const bindings = parsed.data;
  const issues: TaskInputIssue[] = [];
  for (const [name, binding] of Object.entries(bindings)) {
    if (mapping.input?.[name] !== undefined)
      issues.push({ name, message: `参数「${name}」不能同时设置固定值和绑定` });
    const target = childParameters.find((p) => p.name === name);
    if (!target) {
      issues.push({ name, message: `未声明参数「${name}」` });
      continue;
    }
    if (binding.from !== 'taskInput') continue;
    const source = parentParameters.find((p) => p.name === binding.key);
    if (!source)
      issues.push({ name, message: `当前任务未声明参数「${binding.key}」` });
    if (source && target && !canBindTaskParameter(source, target))
      issues.push({
        name,
        message: `参数「${binding.key}」与子任务参数「${name}」类型不兼容`,
      });
  }
  // 绑定可能覆盖默认值，也可能暂时缺值；这里只检查未绑定的字段。
  const literalParameters = childParameters.map((parameter) => {
    if (!bindings[parameter.name]) return parameter;
    return {
      ...parameter,
      required: false,
      defaultValue: undefined,
    };
  });
  issues.push(...resolveTaskInput(literalParameters, mapping.input).issues);
  return { issues };
}

/**
 * 为后续任务编译/执行提供统一解析：父默认值 → 显式映射 → 子默认值与必填校验。
 * 调用者必须在 issues 为空后才派发子任务；不会修改定义或传入的值。
 */
export function resolveTaskInputMapping(
  parentParameters: TaskParameter[],
  childParameters: TaskParameter[],
  mapping: TaskInputMapping,
  parentInput: TaskInput = {},
  runtime?: { results: Record<string, unknown>; context: unknown },
): { input: TaskInput; issues: TaskInputIssue[] } {
  const validated = validateTaskInputMapping(
    parentParameters,
    childParameters,
    mapping,
  );
  const parent = resolveTaskInput(parentParameters, parentInput);
  const issues = [
    ...validated.issues,
    ...parent.issues.map((issue) => ({
      ...issue,
      message: `当前任务：${issue.message}`,
    })),
  ];
  if (issues.length) return { input: {}, issues };
  const provided = { ...mapping.input };
  for (const [name, binding] of Object.entries(mapping.inputBindings ?? {})) {
    const value =
      binding.from === 'taskInput'
        ? parent.input[binding.key]
        : binding.from === 'context'
          ? readResultPath(runtime?.context, [binding.key])
          : readResultPath(runtime?.results[binding.stepId], binding.path);
    // 缺值才回退；false、0、空字符串和 null 都是调用者明确提供的值。
    if (value !== undefined) provided[name] = z.json().parse(value);
    else if (binding.from !== 'taskInput')
      issues.push({ name, message: `参数「${name}」绑定的运行数据不存在` });
  }
  if (issues.length) return { input: {}, issues };
  return resolveTaskInput(childParameters, provided);
}
