import { z } from 'zod';

/** 调用者提供的值；字段声明保存在 TaskDefinition.parameters。 */
export const TaskInput = z
  .record(z.string(), z.json())
  .refine(
    (input) => JSON.stringify(input).length <= 16_000,
    '任务参数最多 16000 个字符',
  );
export type TaskInput = z.output<typeof TaskInput>;

export const PARAMETER_TYPES = ['string', 'number', 'boolean', 'json'] as const;
export const PARAMETER_TYPE_LABELS = {
  string: '文本',
  number: '数字',
  boolean: '布尔值',
  json: 'JSON',
};

export const TaskParameterName = z
  .string()
  .min(1, '请填写参数名')
  .max(64)
  .regex(
    /^[A-Za-z_][A-Za-z0-9_]*$/,
    '参数名只能使用字母、数字和下划线，不能以数字开头',
  )
  .refine(
    (name) => !['__proto__', 'constructor', 'prototype'].includes(name),
    '请使用其他参数名',
  );

export const TaskParameter = z
  .object({
    name: TaskParameterName,
    title: z.string().trim().max(64).default(''),
    description: z.string().trim().max(500).default(''),
    type: z.enum(PARAMETER_TYPES).default('string'),
    required: z.boolean().default(false),
    defaultValue: z.json().optional(),
  })
  .strict()
  .superRefine((parameter, ctx) => {
    if (parameter.defaultValue !== undefined) {
      if (parameter.required)
        ctx.addIssue({
          code: 'custom',
          path: ['defaultValue'],
          message: '必填参数由调用者填写，不能同时设置默认值',
        });
      else if (!matchesParameterType(parameter.type, parameter.defaultValue))
        ctx.addIssue({
          code: 'custom',
          path: ['defaultValue'],
          message: '默认值与参数类型不匹配',
        });
    }
  });
export type TaskParameter = z.output<typeof TaskParameter>;

export const TaskParameters = z
  .array(TaskParameter)
  .max(32, '最多 32 个参数')
  .superRefine((parameters, ctx) => {
    const names = new Set<string>();
    parameters.forEach((parameter, index) => {
      if (names.has(parameter.name))
        ctx.addIssue({
          code: 'custom',
          path: [index, 'name'],
          message: '参数名不能重复',
        });
      names.add(parameter.name);
    });
    const defaults = Object.fromEntries(
      parameters
        .filter((parameter) => parameter.defaultValue !== undefined)
        .map((parameter) => [parameter.name, parameter.defaultValue]),
    );
    if (!TaskInput.safeParse(defaults).success)
      ctx.addIssue({
        code: 'custom',
        message: '所有参数默认值合计最多 16000 个字符',
      });
  });

export function matchesParameterType(
  type: (typeof PARAMETER_TYPES)[number],
  value: unknown,
): boolean {
  return (
    type === 'json' ||
    (typeof value === type && (type !== 'number' || Number.isFinite(value)))
  );
}

export interface TaskInputIssue {
  name: string;
  message: string;
}

/** 保存引用时只检查、不写入默认值；执行时使用返回的独立快照。 */
export function resolveTaskInput(
  parameters: TaskParameter[],
  provided: TaskInput = {},
) {
  const checked = TaskInput.safeParse(provided);
  if (!checked.success)
    return {
      input: {} as TaskInput,
      issues: checked.error.issues.map((issue) => ({
        name: typeof issue.path[0] === 'string' ? issue.path[0] : '',
        message: issue.message,
      })),
    };
  const input = checked.data;
  const issues: TaskInputIssue[] = [];
  const names = new Set(parameters.map((parameter) => parameter.name));
  for (const name of Object.keys(input))
    if (!names.has(name))
      issues.push({ name, message: `未声明参数「${name}」` });
  for (const parameter of parameters) {
    const { name, required, defaultValue, type } = parameter;
    const label = parameter.title ? `${parameter.title}（${name}）` : name;
    const value = input[name];
    if (value === undefined) {
      if (required)
        issues.push({ name, message: `请填写必填参数「${label}」` });
      else if (defaultValue !== undefined)
        input[name] = z.json().parse(defaultValue);
    } else if (!matchesParameterType(type, value)) {
      issues.push({
        name,
        message: `参数「${label}」必须是${PARAMETER_TYPE_LABELS[type]}`,
      });
    } else if (
      required &&
      (value === null || (typeof value === 'string' && !value.trim()))
    ) {
      issues.push({ name, message: `必填参数「${label}」不能为空` });
    }
  }
  const parsed = TaskInput.safeParse(input);
  if (!parsed.success)
    issues.push({
      name: '',
      message: '合并默认值后的任务参数最多 16000 个字符',
    });
  return { input, issues };
}
