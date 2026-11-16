import { describe, expect, it } from 'vitest';
import type { SessionRunSummary } from '@deploy-crab/contracts/session';
import { groupExecutionTurns, statusTone } from './execution-feed-model';

const run = (
  id: string,
  overrides: Partial<SessionRunSummary> = {},
): SessionRunSummary => ({
  id,
  task: '安装 Docker',
  status: 'succeeded',
  createdAt: '2026-11-16T09:00:00.000Z',
  startedAt: null,
  finishedAt: null,
  errors: [],
  dependsOn: [],
  ...overrides,
});

describe('会话执行对话', () => {
  it('将一次提交的多台主机合并，独立的同名提交仍为不同操作', () => {
    const turns = groupExecutionTurns([
      run('c', { requestId: 'second', createdAt: '2026-11-16T09:01:00.000Z' }),
      run('b', { requestId: 'first', targetName: 'host-b' }),
      run('a', { requestId: 'first', targetName: 'host-a' }),
    ]);
    expect(turns.map((turn) => turn.id)).toEqual(['first', 'second']);
    expect(turns[0]?.runs.map((item) => item.targetName)).toEqual([
      'host-a',
      'host-b',
    ]);
  });
  it('兼容没有 requestId 的历史，分页重叠不重复显示', () => {
    const turns = groupExecutionTurns([run('b'), run('a'), run('a')]);
    expect(turns.map((turn) => turn.id)).toEqual(['a', 'b']);
  });
  it('批量执行跨分页时归到同一条操作，不修改原始数据', () => {
    const recent = run('b', { requestId: 'batch' });
    const older = run('a', {
      requestId: 'batch',
      createdAt: '2026-11-16T08:59:59.000Z',
    });
    const records = [recent, older];
    const turns = groupExecutionTurns(records);
    expect(turns).toHaveLength(1);
    expect(turns[0]?.createdAt).toBe(older.createdAt);
    expect(records[0]).toBe(recent);
  });
  it('失败和中断亮红灯，取消与跳过不会误报成功', () => {
    expect(
      ['failed', 'blocked', 'interrupted'].map((status) =>
        statusTone(status as SessionRunSummary['status']),
      ),
    ).toEqual(['red', 'red', 'red']);
    expect(statusTone('running')).toBe('amber');
    expect(statusTone('queued')).toBe('amber');
    expect(statusTone('succeeded')).toBe('green');
    expect(statusTone('cancelled')).toBe('neutral');
    expect(statusTone('skipped')).toBe('neutral');
  });
});
