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
    secret: z.boolean().optional(),
    targetFields: z
      .array(
        z
          .object({
            name: TaskParameterName.refine(
              (name) => name !== 'hostId',
              'hostId 由执行目标提供',
            ),
            title: z.string().trim().min(1).max(64),
            type: z.enum(['string', 'number']),
            defaultValue: z.union([z.string(), z.number()]).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(8)
      .optional(),
    defaultValue: z.json().optional(),
    /** 有限选项是数据约束，创建、引用和执行统一校验。 */
    options: z
      .array(
        z
          .object({
            value: z.union([z.string(), z.number(), z.boolean()]),
            label: z.string().trim().min(1).max(100),
            description: z.string().trim().max(500).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(64)
      .optional(),
    minimum: z.number().finite().optional(),
    maximum: z.number().finite().optional(),
  })
  .strict()
  .superRefine((parameter, ctx) => {
    if (
      parameter.secret &&
      (parameter.type !== 'string' ||
        parameter.options ||
        parameter.defaultValue !== undefined)
    )
      ctx.addIssue({
        code: 'custom',
        message:
          '凭据参数必须是文本，且不能设置选项或默认值；调用时选择凭据引用',
      });
    if (parameter.targetFields) {
      if (parameter.type !== 'json')
        ctx.addIssue({
          code: 'custom',
          message: '按主机填写的参数必须是 JSON 类型',
        });
      if (
        new Set(parameter.targetFields.map((field) => field.name)).size !==
        parameter.targetFields.length
      )
        ctx.addIssue({ code: 'custom', message: '主机字段名称不能重复' });
      for (const field of parameter.targetFields)
        if (
          field.defaultValue !== undefined &&
          typeof field.defaultValue !== field.type
        )
          ctx.addIssue({
            code: 'custom',
            message: '主机字段的默认值必须与类型一致',
          });
    }
    if (parameter.options) {
      const values = new Set<string>();
      for (const option of parameter.options) {
        const key = JSON.stringify(option.value);
        if (
          values.has(key) ||
          parameter.type === 'json' ||
          !matchesParameterType(parameter.type, option.value)
        )
          ctx.addIssue({
            code: 'custom',
            path: ['options'],
            message: '选项值必须唯一且与参数类型一致；JSON 不支持选项',
          });
        values.add(key);
      }
    }
    if (
      (parameter.minimum !== undefined || parameter.maximum !== undefined) &&
      parameter.type !== 'number'
    )
      ctx.addIssue({ code: 'custom', message: '只有数字参数可以设置范围' });
    if (
      parameter.minimum !== undefined &&
      parameter.maximum !== undefined &&
      parameter.minimum > parameter.maximum
    )
      ctx.addIssue({ code: 'custom', message: '最小值不能大于最大值' });
    if (parameter.defaultValue !== undefined) {
      const error = parameterValueError(parameter, parameter.defaultValue);
      if (error)
        ctx.addIssue({
          code: 'custom',
          path: ['defaultValue'],
          message: error,
        });
    }
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

export function parameterValueError(
  parameter: {
    options?: { value: string | number | boolean }[] | undefined;
    minimum?: number | undefined;
    maximum?: number | undefined;
  },
  value: unknown,
): string | null {
  if (
    parameter.options &&
    !parameter.options.some((option) => option.value === value)
  )
    return '请选择定义中的有效选项';
  if (typeof value === 'number') {
    if (parameter.minimum !== undefined && value < parameter.minimum)
      return `不能小于 ${parameter.minimum}`;
    if (parameter.maximum !== undefined && value > parameter.maximum)
      return `不能大于 ${parameter.maximum}`;
  }
  return null;
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
  for (const parameter of parameters) {
    if (input[parameter.name] === undefined) continue;
    if (parameter.secret && !z.uuid().safeParse(input[parameter.name]).success)
      issues.push({
        name: parameter.name,
        message: '请选择凭据，不能直接传入密码或密钥',
      });
    if (parameter.targetFields) {
      const rows = input[parameter.name],
        ids = new Set<string>();
      const valid =
        Array.isArray(rows) &&
        rows.length > 0 &&
        rows.every((row) => {
          if (
            !row ||
            typeof row !== 'object' ||
            Array.isArray(row) ||
            typeof row.hostId !== 'string' ||
            !z.uuid().safeParse(row.hostId).success ||
            ids.has(row.hostId)
          )
            return false;
          ids.add(row.hostId);
          return parameter.targetFields!.every((field) => {
            const value = row[field.name];
            return (
              typeof value === field.type &&
              (typeof value !== 'string' || value.trim().length > 0)
            );
          });
        });
      if (!valid)
        issues.push({
          name: parameter.name,
          message: '请完整填写各主机字段，主机不能重复',
        });
    }
    const error = parameterValueError(parameter, input[parameter.name]);
    if (error)
      issues.push({
        name: parameter.name,
        message: `参数「${parameter.title || parameter.name}」：${error}`,
      });
  }
  const parsed = TaskInput.safeParse(input);
  if (!parsed.success)
    issues.push({
      name: '',
      message: '合并默认值后的任务参数最多 16000 个字符',
    });
  return { input, issues };
}
