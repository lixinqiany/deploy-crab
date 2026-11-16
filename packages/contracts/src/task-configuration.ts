import {
  TASK_HOOK_PHASES,
  type Task,
  type TaskCall,
  type TaskHook,
  type TaskStep,
} from './task';
import type { TaskParameter } from './task-input';

export interface ParameterConsumer {
  path: string;
  title: string;
  required: boolean;
}
export interface ParameterUsage {
  parameter: TaskParameter;
  consumers: ParameterConsumer[];
  active: boolean;
  required: boolean;
}
export interface ConfiguredCall {
  definition: TaskCall;
  child?: ConfiguredTask;
}
export interface ConfiguredHook {
  definition: TaskHook;
  call: ConfiguredCall;
}
export type ConfiguredHooks = Record<
  (typeof TASK_HOOK_PHASES)[number],
  ConfiguredHook[]
>;
export interface ConfiguredStep {
  definition: TaskStep;
  path: string;
  selectedSkip: boolean;
  inactive: boolean;
  call: ConfiguredCall;
  hooks: ConfiguredHooks;
}
export interface ConfiguredTask {
  task: Task;
  path: string;
  steps: ConfiguredStep[];
  hooks: ConfiguredHooks;
  usage: ParameterUsage[];
  parameters: TaskParameter[];
}

/** UI 与服务端共用：按调用位置展开，先确定跳过，再计算参数的有效使用方。 */
export function configureTask(
  root: Task,
  tasks: Task[],
  skippedSteps: string[] = [],
) {
  const skipped = new Set(skippedSteps);
  const allowed = new Set<string>();
  const revisions: Record<string, number> = {};
  const byId = new Map(tasks.map((task) => [task.id, task]));
  byId.set(root.id, root);
  let nodes = 0;
  const build = (
    task: Task,
    path: string,
    inactive: boolean,
    ancestors: string[],
  ): ConfiguredTask => {
    if (ancestors.includes(task.id)) throw new Error('任务引用不能形成循环');
    if (ancestors.length >= 8) throw new Error('任务引用最多 8 层，请简化流程');
    revisions[task.id] = task.revision;
    const consumers = new Map(
      task.definition.parameters.map((p) => [
        p.name,
        [] as ParameterConsumer[],
      ]),
    );
    const use = (name: string, consumer: ParameterConsumer) => {
      const list = consumers.get(name);
      if (!list) throw new Error(`任务「${task.name}」未声明参数「${name}」`);
      list.push(consumer);
    };
    const call = (
      definition: TaskCall,
      callPath: string,
      title: string,
      disabled: boolean,
    ): ConfiguredCall => {
      if (++nodes > 512) throw new Error('展开后最多 512 个调用，请拆分执行');
      if (definition.kind === 'task') {
        const childTask = byId.get(definition.taskId);
        if (!childTask) throw new Error(`任务「${title}」引用的任务不存在`);
        const child = build(childTask, `${callPath}.task.`, disabled, [
          ...ancestors,
          task.id,
        ]);
        if (!disabled)
          for (const [name, binding] of Object.entries(
            definition.inputBindings ?? {},
          )) {
            if (binding.from !== 'taskInput') continue;
            const usage = child.usage.find(
              (item) => item.parameter.name === name,
            );
            if (usage?.active)
              use(binding.key, {
                path: callPath,
                title,
                required: usage.required,
              });
          }
        return { definition, child };
      }
      if (!disabled && definition.action === 'ssh.exec')
        for (const name of definition.usesInputs ??
          task.definition.parameters.map((p) => p.name))
          use(name, { path: callPath, title, required: false });
      return { definition };
    };
    const hooks = (
      definitions: Task['definition']['hooks'],
      prefix: string,
      disabled: boolean,
    ): ConfiguredHooks => {
      const configured: ConfiguredHooks = {
        before: [],
        afterSuccess: [],
        finally: [],
      };
      for (const phase of TASK_HOOK_PHASES)
        configured[phase] = definitions[phase].map((hook) => {
          if (!disabled && hook.placement?.kind === 'input')
            use(hook.placement.key, {
              path: `${prefix}.${phase}.${hook.key}`,
              title: hook.title,
              required: true,
            });
          return {
            definition: hook,
            call: call(
              hook.call,
              `${prefix}.${phase}.${hook.key}`,
              `${task.name} / ${hook.title}`,
              disabled,
            ),
          };
        });
      return configured;
    };
    const steps = task.definition.steps.map((step): ConfiguredStep => {
      const stepPath = `${path}steps.${step.id}`;
      if (step.skippable) allowed.add(stepPath);
      const selectedSkip = skipped.has(stepPath);
      const disabled = inactive || selectedSkip;
      if (!disabled && step.placement?.kind === 'input')
        use(step.placement.key, {
          path: stepPath,
          title: step.title,
          required: true,
        });
      return {
        definition: step,
        path: stepPath,
        selectedSkip,
        inactive: disabled,
        call: call(
          step.call,
          stepPath,
          `${task.name} / ${step.title}`,
          disabled,
        ),
        hooks: hooks(step.hooks, `${stepPath}.hooks`, disabled),
      };
    });
    const configuredHooks = hooks(
      task.definition.hooks,
      `${path}hooks`,
      inactive,
    );
    const usage = task.definition.parameters.map(
      (parameter): ParameterUsage => {
        const usedBy = consumers.get(parameter.name)!;
        return {
          parameter,
          consumers: usedBy,
          active: usedBy.length > 0,
          required:
            usedBy.length > 0 &&
            parameter.defaultValue === undefined &&
            (parameter.required || usedBy.some((item) => item.required)),
        };
      },
    );
    return {
      task,
      path,
      steps,
      hooks: configuredHooks,
      usage,
      parameters: usage
        .filter((item) => item.active)
        .map((item) => ({ ...item.parameter, required: item.required })),
    };
  };
  // 子路径以点结尾，避免步骤与钩子的位置混淆。
  const configured = build(root, '', false, []);
  for (const path of skipped)
    if (!allowed.has(path))
      throw new Error(`步骤「${path}」不存在或不允许跳过`);
  return { configured, revisions };
}
