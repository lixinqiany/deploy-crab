import {
  resolveTaskInput,
  type TaskInput,
} from '@deploy-crab/contracts/task-input';
import type { ConfiguredTask } from '@deploy-crab/contracts/task-configuration';
import { parseParameterValue } from '../tasks/parameter-editor-model';

/** 只解析本次仍被使用的字段，隐藏字段保留原始草稿，恢复步骤后继续校验。 */
export function resolveSessionFields(
  configuration: ConfiguredTask,
  fields: Record<string, string>,
) {
  const input: TaskInput = {};
  const errors: Record<string, string> = {};
  for (const parameter of configuration.parameters) {
    const raw = fields[parameter.name];
    if (raw === undefined) continue;
    const parsed = parseParameterValue(parameter.type, raw);
    if (parsed.error !== null) errors[parameter.name] = parsed.error;
    else input[parameter.name] = parsed.value;
  }
  for (const issue of resolveTaskInput(configuration.parameters, input).issues)
    errors[issue.name] ??= issue.message;
  return { input, errors };
}
