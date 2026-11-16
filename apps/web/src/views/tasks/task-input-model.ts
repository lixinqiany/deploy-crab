import {
  resolveTaskInput,
  type TaskInput,
  type TaskParameter,
} from '@deploy-crab/contracts/task-input';
import {
  TASK_HOOK_PHASES,
  type Task,
  type TaskCall,
  type TaskDefinition,
  type TaskHooks,
} from '@deploy-crab/contracts/task';
import { parseParameterValue } from './parameter-editor-model';

export type FieldDrafts = Record<string, string>;
export type InputDrafts = Record<string, FieldDrafts>;
export interface InputDraft {
  fields: FieldDrafts;
  onChange: (name: string, text: string) => void;
  clear: () => void;
}

/** 仅保存用户覆盖的值；默认值在调用时解析，避免固定成旧版本的默认值。 */
export function resolveCallInput(
  parameters: TaskParameter[],
  original: TaskInput = {},
  fields: FieldDrafts = {},
) {
  const input = structuredClone(original);
  const errors: Record<string, string> = {};
  for (const [name, text] of Object.entries(fields)) {
    delete input[name];
    if (text === '') continue;
    const parameter = parameters.find((item) => item.name === name);
    if (!parameter) {
      errors[name] = `未声明参数「${name}」`;
      continue;
    }
    const parsed = parseParameterValue(parameter.type, text);
    if (parsed.error !== null) errors[name] = parsed.error;
    else input[name] = parsed.value;
  }
  for (const issue of resolveTaskInput(parameters, input).issues)
    errors[issue.name] ??= issue.message;
  return { input, errors };
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
      call.input,
      drafts[path],
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
