import { z } from 'zod';

export const ResultPath = z
  .array(
    z
      .string()
      .min(1)
      .max(100)
      .refine(
        (key) => !['__proto__', 'prototype', 'constructor'].includes(key),
        '结果路径包含保留字段',
      ),
  )
  .max(16);

/** 规则保存在任务中，具体主机来自本次执行的目标快照。 */
export const TaskPlacement = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('each') }).strict(),
  z.object({ kind: z.literal('first') }).strict(),
  z
    .object({ kind: z.literal('input'), key: z.string().min(1).max(64) })
    .strict(),
  z
    .object({
      kind: z.literal('result'),
      stepId: z.string().min(1).max(64),
      path: ResultPath,
    })
    .strict(),
]);
export type TaskPlacement = z.output<typeof TaskPlacement>;

export interface TaskTargetInfo {
  id: string;
  name: string;
  address: string;
}
export interface TaskExecutionContext {
  target?: TaskTargetInfo;
  targets: TaskTargetInfo[];
  results?: Record<string, unknown>;
}

export function readResultPath(
  value: unknown,
  path: readonly string[],
): unknown {
  for (const key of path) {
    if (
      !value ||
      typeof value !== 'object' ||
      !Object.hasOwn(value, key) ||
      ['__proto__', 'prototype', 'constructor'].includes(key)
    )
      return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}
