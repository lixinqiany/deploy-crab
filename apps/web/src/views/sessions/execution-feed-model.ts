import type { ExecutionStatus } from '@deploy-crab/contracts/execution';
import type { SessionRunSummary } from '@deploy-crab/contracts/session';

export const statusLabels: Record<ExecutionStatus, string> = {
  queued: '等待执行',
  running: '执行中',
  succeeded: '已完成',
  failed: '执行失败',
  blocked: '前置失败',
  cancelled: '已取消',
  interrupted: '已中断',
  skipped: '已跳过',
};

export const statusTone = (status: ExecutionStatus) => {
  if (status === 'succeeded') return 'green';
  if (status === 'queued' || status === 'running') return 'amber';
  if (['failed', 'blocked', 'interrupted'].includes(status)) return 'red';
  return 'neutral';
};

export interface ExecutionTurn {
  id: string;
  createdAt: string;
  task: string;
  runs: SessionRunSummary[];
}

/** 一次多主机提交是一条指令；独立提交即使同名也不能合并。 */
export const groupExecutionTurns = (
  runs: SessionRunSummary[],
): ExecutionTurn[] => {
  const turns = new Map<string, ExecutionTurn>();
  const seen = new Set<string>();
  const ordered = [...runs].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
  for (const run of ordered) {
    if (seen.has(run.id)) continue;
    seen.add(run.id);
    const id = run.requestId ?? run.id;
    const turn = turns.get(id);
    if (turn) turn.runs.push(run);
    else
      turns.set(id, {
        id,
        createdAt: run.createdAt,
        task: run.task,
        runs: [run],
      });
  }
  return [...turns.values()].map((turn) => ({
    ...turn,
    runs: turn.runs.sort(
      (a, b) =>
        (a.targetName ?? a.id).localeCompare(b.targetName ?? b.id) ||
        a.id.localeCompare(b.id),
    ),
  }));
};
