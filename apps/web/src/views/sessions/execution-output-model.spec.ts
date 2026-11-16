import { describe, expect, it } from 'vitest';
import type { ExecutionOutput } from '@deploy-crab/contracts/execution';
import { indexRunOutput } from './execution-output-model';

const output = (
  sequence: number,
  text: string,
  stepId: string | null = null,
  hookId: string | null = null,
): ExecutionOutput => ({
  sequence,
  text,
  stepId,
  hookId,
  at: '2026-11-16T10:00:00.000Z',
  stream: 'stdout',
});

describe('步骤输出归属', () => {
  it('步骤正文、步骤钩子和任务钩子分别归属；不把钩子输出混入步骤正文', () => {
    const indexed = indexRunOutput({
      steps: [
        { id: 'install', hooks: [{ id: 'cleanup' }] },
        { id: 'verify', hooks: [] },
      ],
      hooks: [{ id: 'before' }],
      output: [
        output(4, 'verify', 'verify'),
        output(2, 'install', 'install'),
        output(3, 'cleanup', 'install', 'cleanup'),
        output(1, 'before', null, 'before'),
        output(5, 'task output'),
      ],
    });
    expect(indexed.steps.get('install')?.map((item) => item.text)).toEqual([
      'install',
    ]);
    expect(indexed.steps.get('verify')?.map((item) => item.text)).toEqual([
      'verify',
    ]);
    expect(indexed.hooks.get('cleanup')?.map((item) => item.text)).toEqual([
      'cleanup',
    ]);
    expect(indexed.hooks.get('before')?.map((item) => item.text)).toEqual([
      'before',
    ]);
    expect(indexed.task.map((item) => item.text)).toEqual(['task output']);
  });
  it('父子任务有相同步骤标识时，日志仍按各自 Run 隔离', () => {
    const owners = { steps: [{ id: 'work', hooks: [] }], hooks: [] };
    const parent = indexRunOutput({
      ...owners,
      output: [output(1, 'parent', 'work')],
    });
    const child = indexRunOutput({
      ...owners,
      output: [output(2, 'child', 'work')],
    });
    expect(parent.steps.get('work')?.map((item) => item.text)).toEqual([
      'parent',
    ]);
    expect(child.steps.get('work')?.map((item) => item.text)).toEqual([
      'child',
    ]);
  });
  it('保留无法关联的旧日志，并按原始序号排序，不修改原数组', () => {
    const entries = [
      output(3, 'last', 'gone'),
      output(1, 'first'),
      output(2, 'hook gone', 'known', 'gone'),
    ];
    const indexed = indexRunOutput({
      steps: [{ id: 'known', hooks: [] }],
      hooks: [],
      output: entries,
    });
    expect(indexed.task.map((item) => item.sequence)).toEqual([1, 2, 3]);
    expect(indexed.steps.get('known')).toEqual([]);
    expect(entries[0]?.sequence).toBe(3);
  });
});
