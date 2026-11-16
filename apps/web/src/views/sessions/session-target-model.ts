import type { Cluster } from '@deploy-crab/contracts/cluster';
import type { Host } from '@deploy-crab/contracts/host';
import {
  resolveTargetSelection,
  type TargetSelection,
} from '@deploy-crab/contracts/execution-target';

export const previewTarget = (
  selection: TargetSelection | undefined,
  clusters: Cluster[],
  hosts: Host[],
) => {
  if (!selection) return { value: null, error: '' };
  try {
    return {
      value: resolveTargetSelection(selection, clusters, hosts),
      error: '',
    };
  } catch (error) {
    return {
      value: null,
      error: error instanceof Error ? error.message : '执行目标无效',
    };
  }
};
