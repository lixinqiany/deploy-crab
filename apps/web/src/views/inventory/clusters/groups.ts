import type { Cluster, ClusterMember } from '@deploy-crab/contracts/cluster';
import type { Host } from '@deploy-crab/contracts/host';

/** 集群里的一台主机：引用的主机可能已被删除（数据被手工改过），此时 `host` 为空 */
export interface MemberView {
  member: ClusterMember;
  host: Host | undefined;
}

/** 每台主机只出现一次，按名称排序；分组也按名称排序，便于对齐比较 */
export const memberViews = (
  cluster: Cluster,
  hostById: ReadonlyMap<string, Host>,
): MemberView[] =>
  cluster.members
    .map((member) => ({
      member: { ...member, groups: [...member.groups].sort() },
      host: hostById.get(member.hostId),
    }))
    .sort((a, b) => (a.host?.name ?? '').localeCompare(b.host?.name ?? ''));

/** 集群里的分组及各自的主机数，按名称排序 */
export const groupCounts = (
  cluster: Cluster,
): { name: string; count: number }[] => {
  const counts = new Map<string, number>();
  for (const member of cluster.members) {
    for (const name of member.groups) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

/** 集群里用到的全部分组名，用于编辑时的候选 */
export const allGroupNames = (clusters: Cluster[]): string[] =>
  [
    ...new Set(
      clusters.flatMap((cluster) =>
        cluster.members.flatMap((member) => member.groups),
      ),
    ),
  ].sort();
