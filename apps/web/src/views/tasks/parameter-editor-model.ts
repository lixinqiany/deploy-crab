import {
  TaskInput,
  TaskParameters,
  matchesParameterType,
  PARAMETER_TYPE_LABELS,
  type TaskParameter,
} from '@deploy-crab/contracts/task-input';

export interface ParameterDraft {
  key: string;
  name: string;
  title: string;
  description: string;
  type: TaskParameter['type'];
  required: boolean;
  hasDefault: boolean;
  defaultText: string;
  choices?: {
    key: string;
    value: string;
    label: string;
    description: string;
  }[];
  minimum?: number | undefined;
  maximum?: number | undefined;
  secret?: boolean;
  targetFields?:
    | (NonNullable<TaskParameter['targetFields']>[number] & { key: string })[]
    | undefined;
}

export const formatParameterValue = (
  type: TaskParameter['type'],
  value: TaskInput[string],
): string =>
  type === 'string' && typeof value === 'string'
    ? value
    : JSON.stringify(value, null, 2);

export function parseParameterValue(
  type: TaskParameter['type'],
  text: string,
): { value: TaskInput[string]; error: null } | { error: string } {
  try {
    const raw: unknown = type === 'string' ? text : JSON.parse(text);
    const parsed = TaskInput.safeParse({ value: raw });
    if (!parsed.success) return { error: '参数值无效或过大' };
    const value = parsed.data.value!;
    if (!matchesParameterType(type, value))
      return { error: `请填写${PARAMETER_TYPE_LABELS[type]}类型的值` };
    return { value, error: null };
  } catch {
    return {
      error:
        type === 'json'
          ? '请填写合法的 JSON'
          : `请填写有效的${PARAMETER_TYPE_LABELS[type]}`,
    };
  }
}

export const parameterDraft = (parameter?: TaskParameter): ParameterDraft => ({
  key: crypto.randomUUID(),
  name: parameter?.name ?? '',
  title: parameter?.title ?? '',
  description: parameter?.description ?? '',
  type: parameter?.type ?? 'string',
  required: parameter?.required ?? false,
  choices:
    parameter?.options?.map((option) => ({
      key: crypto.randomUUID(),
      value: formatParameterValue(parameter.type, option.value),
      label: option.label,
      description: option.description ?? '',
    })) ?? [],
  minimum: parameter?.minimum,
  maximum: parameter?.maximum,
  secret: parameter?.secret ?? false,
  targetFields: parameter?.targetFields?.map((field) => ({
    ...field,
    key: crypto.randomUUID(),
  })),
  hasDefault: parameter?.defaultValue !== undefined,
  defaultText:
    parameter?.defaultValue === undefined
      ? ''
      : formatParameterValue(parameter.type, parameter.defaultValue),
});

export function resolveParameterDrafts(drafts: ParameterDraft[]) {
  const errors: string[] = [];
  const parameters: TaskParameter[] = drafts.map((draft, index) => {
    const { name, title, description, type, required } = draft;
    const parameter: TaskParameter = {
      name,
      title,
      description,
      type,
      required,
    };
    if (draft.secret) parameter.secret = true;
    if (draft.targetFields?.length)
      parameter.targetFields = draft.targetFields.map(
        ({ key: _key, ...field }) => field,
      );
    if (type === 'number') {
      if (draft.minimum !== undefined) parameter.minimum = draft.minimum;
      if (draft.maximum !== undefined) parameter.maximum = draft.maximum;
    }
    if (draft.choices?.length) {
      parameter.options = [];
      for (const option of draft.choices) {
        const parsed = parseParameterValue(type, option.value);
        if (
          parsed.error ||
          !('value' in parsed) ||
          !['string', 'number', 'boolean'].includes(typeof parsed.value)
        )
          errors.push(`参数 ${index + 1}：选项值与类型不匹配`);
        else
          parameter.options.push({
            value: parsed.value as string | number | boolean,
            label: option.label,
            description: option.description,
          });
      }
    }
    if (draft.hasDefault && !required) {
      const parsed = parseParameterValue(type, draft.defaultText);
      if (parsed.error !== null)
        errors.push(`参数 ${index + 1} 默认值：${parsed.error}`);
      else parameter.defaultValue = parsed.value;
    }
    return parameter;
  });
  const parsed = TaskParameters.safeParse(parameters);
  if (!parsed.success)
    errors.push(
      ...parsed.error.issues.map(
        (issue) =>
          `${typeof issue.path[0] === 'number' ? `参数 ${issue.path[0] + 1}` : '任务参数'}：${issue.message}`,
      ),
    );
  return { parameters, errors };
}

export const taskInputExample = (parameters: TaskParameter[]): string =>
  [
    "python3 - <<'PY'",
    'import json, os',
    "inputs = json.loads(os.environ.get('DEPLOY_CRAB_INPUT', '{}'))",
    '',
    ...parameters.map((parameter) => {
      const access = parameter.required
        ? `inputs[${JSON.stringify(parameter.name)}]`
        : `inputs.get(${JSON.stringify(parameter.name)})`;
      return parameter.secret
        ? `value_${parameter.name} = ${access}  # 凭据在执行时解析为明文，请勿打印`
        : `print(${access})`;
    }),
    'PY',
  ].join('\n');
