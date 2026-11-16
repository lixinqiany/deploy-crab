import { TASK_HOOK_PHASES } from '@deploy-crab/contracts/task';
import type {
  ConfiguredCall,
  ConfiguredHooks,
  ConfiguredTask,
} from '@deploy-crab/contracts/task-configuration';
import {
  resolveTaskInput,
  type TaskInput,
} from '@deploy-crab/contracts/task-input';
import { resolveTaskInputMapping } from '@deploy-crab/contracts/task-input-bindings';
import type { ConnectionTarget } from '@deploy-crab/contracts/connection';
import type { ActionCall, ExecutionPlan, Hooks } from '../execution/definition';
import { ValidationError } from '../errors/domain-error';

/** 编译所有会执行的嵌套调用并校验参数，成功后才允许派发任何 SSH 操作。 */
export function compileStoredTask(
  config: ConfiguredTask,
  target: ConnectionTarget,
  targetName: string,
  provided: TaskInput,
) {
  const active = new Set(config.parameters.map((p) => p.name));
  const unknown = Object.keys(provided).filter(
    (name) => !config.task.definition.parameters.some((p) => p.name === name),
  );
  const resolved = resolveTaskInput(
    config.parameters,
    Object.fromEntries(
      Object.entries(provided).filter(([name]) => active.has(name)),
    ),
  );
  const issues = [
    ...resolved.issues,
    ...unknown.map((name) => ({ name, message: `未声明参数「${name}」` })),
  ];
  if (issues.length)
    throw new ValidationError(
      `任务「${config.task.name}」的参数需要调整`,
      issues.map((issue) => ({
        path: [config.path, 'input', issue.name],
        message: issue.message,
      })),
    );
  const input = resolved.input;
  const call = (configured: ConfiguredCall): ActionCall => {
    const definition = configured.definition;
    if (definition.kind === 'action')
      return {
        action: definition.action,
        input: definition.input,
        ...(definition.action === 'ssh.exec' &&
        definition.usesInputs !== undefined
          ? { usesInputs: definition.usesInputs }
          : {}),
      };
    const child = configured.child!;
    const names = new Set(child.parameters.map((p) => p.name));
    const mapping = {
      input: Object.fromEntries(
        Object.entries(definition.input ?? {}).filter(([name]) =>
          names.has(name),
        ),
      ),
      inputBindings: Object.fromEntries(
        Object.entries(definition.inputBindings ?? {}).filter(([name]) =>
          names.has(name),
        ),
      ),
    };
    const childInput = resolveTaskInputMapping(
      config.parameters,
      child.parameters,
      mapping,
      input,
    );
    if (childInput.issues.length)
      throw new ValidationError(
        `子任务「${child.task.name}」的参数需要调整`,
        childInput.issues.map((issue) => ({
          path: [child.path, 'input', issue.name],
          message: issue.message,
        })),
      );
    const compiled = compileStoredTask(
      child,
      target,
      targetName,
      childInput.input,
    );
    return { action: 'task.invoke', task: compiled };
  };
  const hooks = (configured: ConfiguredHooks): Hooks =>
    Object.fromEntries(
      TASK_HOOK_PHASES.map((phase) => [
        phase,
        configured[phase].map((hook) => ({
          ...call(hook.call),
          key: hook.definition.key,
          title: hook.definition.title,
          timeoutMs: hook.definition.timeoutMs,
        })),
      ]),
    );
  const plan: ExecutionPlan = {
    task: config.task.name,
    taskId: config.task.id,
    taskRevision: config.task.revision,
    target,
    targetName,
    parameters: config.parameters,
    skippedSteps: config.steps
      .filter((step) => step.inactive)
      .map((step) => step.path),
    hooks: hooks(config.hooks),
    steps: config.steps.map((step) => ({
      id: step.definition.id,
      title: step.definition.title,
      dependsOn: step.definition.dependsOn,
      timeoutMs: step.definition.timeoutMs,
      ...(step.inactive
        ? { action: 'task.skipped', skip: true }
        : { ...call(step.call), hooks: hooks(step.hooks) }),
    })),
  };
  return { plan, input };
}
