import type { ConnectionTarget } from '@deploy-crab/contracts/connection';
import type { TaskPlanner } from '../execution/definition';

export const hostCheckTask: TaskPlanner<ConnectionTarget> = {
  key: 'host.check',
  plan: (target) => ({
    task: 'host.check',
    target,
    steps: [
      {
        id: 'check-connection',
        title: '检查 SSH 连通性',
        action: 'ssh.probe',
        timeoutMs: 20_000,
      },
    ],
  }),
};
