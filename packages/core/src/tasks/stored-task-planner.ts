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
import {
  resolveTaskInputMapping,
  validateTaskInputMapping,
} from '@deploy-crab/contracts/task-input-bindings';
import type {
  TaskExecutionContext,
  TaskPlacement,
} from '@deploy-crab/contracts/task-placement';
import type { ConnectionTarget } from '@deploy-crab/contracts/connection';
import type { ActionCall, ExecutionPlan, Hooks } from '../execution/definition';
import { ValidationError } from '../errors/domain-error';

/** 编译所有会执行的嵌套调用并校验参数，成功后才允许派发任何 SSH 操作。 */
export function compileStoredTask(
  config: ConfiguredTask,
  target: ConnectionTarget,
  targetName: string,
  provided: TaskInput,
  context?: TaskExecutionContext,
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
    if (
      Object.values(mapping.inputBindings).some(
        (binding) => binding.from !== 'taskInput',
      )
    ) {
      const checked = validateTaskInputMapping(
        config.parameters,
        child.parameters,
        mapping,
      );
      if (checked.issues.length)
        throw new ValidationError(
          '子任务参数绑定无效',
          checked.issues.map((issue) => ({
            path: [config.path, 'input', issue.name],
            message: issue.message,
          })),
        );
      return {
        action: 'task.invoke',
        deferredTask: {
          config: child,
          mapping,
          parameters: config.parameters,
          target,
          targetName,
          context: context ?? { targets: [] },
        },
      };
    }
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
    const compiled = compileTaskInvocation(
      child,
      target,
      targetName,
      childInput.input,
      context,
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
    ...(context ? { context } : {}),
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

export interface TaskHostTarget {
  hostId: string;
  name: string;
  target: ConnectionTarget;
}

export function compileTaskInvocation(
  config: ConfiguredTask,
  target: ConnectionTarget,
  name: string,
  input: TaskInput,
  context?: TaskExecutionContext,
) {
  if (config.task.definition.execution === 'orchestrated') {
    if (!target.hostId)
      throw new ValidationError('协作任务需要已保存的目标主机', []);
    return compileOrchestratedTask(
      config,
      [{ hostId: target.hostId, name, target }],
      input,
      name,
      context?.targets,
    );
  }
  return compileStoredTask(config, target, name, input, context);
}

/** 协作任务只生成一个根计划；每个逻辑步骤分派到冻结的成员快照。 */
export function compileOrchestratedTask(
  config: ConfiguredTask,
  targets: TaskHostTarget[],
  provided: TaskInput,
  label: string,
  inheritedTargets?: TaskExecutionContext['targets'],
) {
  if (!targets.length) throw new ValidationError('请至少选择一台主机', []);
  const members = targets.map(({ hostId, name, target }) => ({
    id: hostId,
    name,
    address: target.endpoint.address,
  }));
  const allMembers = inheritedTargets ?? members;
  const compiled = targets.map((host, index) =>
    compileStoredTask(config, host.target, host.name, provided, {
      target: members[index]!,
      targets: allMembers,
    }),
  );
  const first = compiled[0]!;
  const dispatch = (
    title: string,
    placement: TaskPlacement | undefined,
    select: (plan: ExecutionPlan) => ActionCall,
  ): ActionCall => {
    const rule = placement ?? { kind: 'each' };
    if (
      rule.kind === 'input' &&
      !targets.some((target) => target.hostId === first.input[rule.key])
    )
      throw new ValidationError('指定的执行主机不在本次目标中', []);
    return {
      action: 'task.dispatch',
      dispatch: {
        placement: rule,
        branches: compiled.map(({ plan, input }, index) => ({
          hostId: targets[index]!.hostId,
          input,
          plan: {
            task: `${title} · ${targets[index]!.name}`,
            target: targets[index]!.target,
            targetName: targets[index]!.name,
            context: plan.context!,
            parameters: config.parameters,
            steps: [{ ...select(plan), id: 'execute', title, dependsOn: [] }],
          },
        })),
      },
    };
  };
  const hooks = (
    definitions: ConfiguredHooks,
    select: (plan: ExecutionPlan) => Hooks | undefined,
  ): Hooks =>
    Object.fromEntries(
      TASK_HOOK_PHASES.map((phase) => [
        phase,
        definitions[phase].map((hook, index) => ({
          ...dispatch(
            hook.definition.title,
            hook.definition.placement,
            (plan) => select(plan)![phase]![index]!,
          ),
          key: hook.definition.key,
          title: hook.definition.title,
          timeoutMs: hook.definition.timeoutMs,
        })),
      ]),
    );
  const plan: ExecutionPlan = {
    ...first.plan,
    target: { kind: 'group', hostIds: targets.map((target) => target.hostId) },
    targetName: label,
    context: { targets: allMembers },
    hooks: hooks(config.hooks, (plan) => plan.hooks),
    steps: config.steps.map((step, index) => ({
      id: step.definition.id,
      title: step.definition.title,
      dependsOn: step.definition.dependsOn,
      timeoutMs: step.definition.timeoutMs,
      ...(step.inactive
        ? { action: 'task.skipped', skip: true }
        : {
            ...dispatch(
              step.definition.title,
              step.definition.placement,
              (plan) => ({ ...plan.steps[index]!, hooks: undefined }),
            ),
            hooks: hooks(step.hooks, (plan) => plan.steps[index]!.hooks),
          }),
    })),
  };
  return { plan, input: first.input };
}
