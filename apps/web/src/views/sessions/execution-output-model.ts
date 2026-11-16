import type { ExecutionOutput } from '@deploy-crab/contracts/execution';

/** 每个 Run 单独索引。步骤钩子的输出同时带 stepId/hookId，必须优先归到钩子。 */
export const indexRunOutput = (run: {
  output: ExecutionOutput[];
  steps: { id: string; hooks: { id: string }[] }[];
  hooks: { id: string }[];
}) => {
  const steps = new Map(
    run.steps.map((step) => [step.id, [] as ExecutionOutput[]]),
  );
  const hooks = new Map(
    [...run.hooks, ...run.steps.flatMap((step) => step.hooks)].map((hook) => [
      hook.id,
      [] as ExecutionOutput[],
    ]),
  );
  const task: ExecutionOutput[] = [];
  for (const item of [...run.output].sort((a, b) => a.sequence - b.sequence)) {
    const owner = item.hookId
      ? hooks.get(item.hookId)
      : item.stepId
        ? steps.get(item.stepId)
        : task;
    (owner ?? task).push(item);
  }
  return { steps, hooks, task };
};
