import type { TaskParameter } from '@deploy-crab/contracts/task-input';
import {
  validateTaskInputMapping,
  type TaskInputMapping,
} from '@deploy-crab/contracts/task-input-bindings';
import {
  TASK_HOOK_PHASES,
  type Task,
  type TaskCall,
  type TaskDefinition,
  type TaskHooks,
} from '@deploy-crab/contracts/task';
import {
  formatParameterValue,
  parseParameterValue,
} from './parameter-editor-model';

export interface InputFieldDraft {
  mode: 'omit' | 'value' | 'binding' | 'result' | 'context';
  text: string;
  sourceKey: string;
}
export type FieldDrafts = Record<string, InputFieldDraft>;
export type InputDrafts = Record<string, FieldDrafts>;
export interface InputDraft {
  fields: FieldDrafts;
  onChange: (name: string, field: InputFieldDraft) => void;
  clear: () => void;
}

export function inputFieldDraft(
  parameter: TaskParameter,
  mapping: TaskInputMapping,
): InputFieldDraft {
  const value = mapping.input?.[parameter.name];
  const binding = mapping.inputBindings?.[parameter.name];
  return {
    mode: binding
      ? binding.from === 'stepResult'
        ? 'result'
        : binding.from === 'context'
          ? 'context'
          : 'binding'
      : value !== undefined
        ? 'value'
        : 'omit',
    text:
      binding?.from === 'stepResult'
        ? binding.path.join('.')
        : value === undefined
          ? ''
          : formatParameterValue(parameter.type, value),
    sourceKey:
      binding?.from === 'stepResult' ? binding.stepId : (binding?.key ?? ''),
  };
}

/** 仅保存用户覆盖的值；默认值在调用时解析，避免固定成旧版本的默认值。 */
export function resolveCallInput(
  parameters: TaskParameter[],
  mapping: TaskInputMapping = {},
  fields: FieldDrafts = {},
  parentParameters: TaskParameter[] = [],
) {
  const input = structuredClone(mapping.input ?? {});
  const inputBindings = structuredClone(mapping.inputBindings ?? {});
  const errors: Record<string, string> = {};
  for (const [name, field] of Object.entries(fields)) {
    delete input[name];
    delete inputBindings[name];
    if (field.mode === 'omit') continue;
    const parameter = parameters.find((item) => item.name === name);
    if (!parameter) {
      errors[name] = `未声明参数「${name}」`;
      continue;
    }
    if (field.mode === 'binding') {
      if (!field.sourceKey) errors[name] = '请选择当前任务的参数';
      else inputBindings[name] = { from: 'taskInput', key: field.sourceKey };
      continue;
    }
    if (field.mode === 'result') {
      if (!field.sourceKey) errors[name] = '请选择提供结果的前置步骤';
      else
        inputBindings[name] = {
          from: 'stepResult',
          stepId: field.sourceKey,
          path: field.text ? field.text.split('.') : [],
        };
      continue;
    }
    if (field.mode === 'context') {
      if (field.sourceKey !== 'target' && field.sourceKey !== 'targets')
        errors[name] = '请选择执行上下文';
      else inputBindings[name] = { from: 'context', key: field.sourceKey };
      continue;
    }
    const parsed = parseParameterValue(parameter.type, field.text);
    if (parsed.error !== null) errors[name] = parsed.error;
    else input[name] = parsed.value;
  }
  for (const issue of validateTaskInputMapping(parentParameters, parameters, {
    input,
    inputBindings,
  }).issues)
    errors[issue.name] ??= issue.message;
  return { input, inputBindings, errors };
}

/** 草稿归整个编辑器管理，切换、重排和复制步骤不丢失未完成的输入。 */
export function resolveInputDrafts(
  definition: TaskDefinition,
  drafts: InputDrafts,
  tasks: Task[],
) {
  const next = structuredClone(definition);
  const errors: string[] = [];
  const resolve = (call: TaskCall, path: string, title: string): TaskCall => {
    if (call.kind !== 'task') return call;
    const task = tasks.find((item) => item.id === call.taskId);
    if (!task) {
      errors.push(`${title}：请选择可用任务`);
      return call;
    }
    const resolved = resolveCallInput(
      task.definition.parameters,
      call,
      drafts[path],
      next.parameters,
    );
    errors.push(
      ...Object.values(resolved.errors).map((error) => `${title}：${error}`),
    );
    return {
      kind: 'task',
      taskId: call.taskId,
      ...(Object.keys(resolved.input).length || call.input !== undefined
        ? { input: resolved.input }
        : {}),
      ...(Object.keys(resolved.inputBindings).length ||
      call.inputBindings !== undefined
        ? { inputBindings: resolved.inputBindings }
        : {}),
    };
  };
  const hooks = (items: TaskHooks, path: string, title: string) => {
    for (const phase of TASK_HOOK_PHASES)
      for (const hook of items[phase])
        hook.call = resolve(
          hook.call,
          `${path}.${phase}.${hook.key}`,
          `${title} / ${hook.title}`,
        );
  };
  for (const step of next.steps) {
    step.call = resolve(step.call, `steps.${step.id}.call`, step.title);
    hooks(step.hooks, `steps.${step.id}.hooks`, step.title);
  }
  hooks(next.hooks, 'hooks', '任务钩子');
  return { definition: next, errors };
}
