import { z } from 'zod';
import { ResourceId } from './fields';
import { ClusterGroup, type Cluster } from './cluster';
import type { Host } from './host';

export const MAX_EXECUTION_HOSTS = 32;
const HostIds = z
  .array(ResourceId)
  .max(MAX_EXECUTION_HOSTS)
  .refine((ids) => new Set(ids).size === ids.length, '主机不能重复');
const ClusterScope = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }).strict(),
  z
    .object({
      kind: z.literal('groups'),
      groups: z
        .array(ClusterGroup)
        .max(500)
        .refine(
          (groups) => new Set(groups).size === groups.length,
          '分组不能重复',
        ),
    })
    .strict(),
  z.object({ kind: z.literal('hosts'), hostIds: HostIds }).strict(),
]);

/** 用户选择的范围。允许空列表留作草稿；提交前必须解析成非空主机名单。 */
export const TargetSelection = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hosts'), hostIds: HostIds }).strict(),
  z
    .object({
      kind: z.literal('cluster'),
      clusterId: ResourceId,
      scope: ClusterScope,
    })
    .strict(),
]);
export type TargetSelection = z.output<typeof TargetSelection>;

/** 提交时的范围快照；历史展示不再查询当前集群。连接信息仍由各 Run 单独冻结。 */
export interface TargetSnapshot {
  selection: TargetSelection;
  label: string;
  hostIds: string[];
}

export const resolveTargetSelection = (
  selection: TargetSelection,
  clusters: Pick<Cluster, 'id' | 'name' | 'members'>[],
  hosts: Pick<Host, 'id'>[],
): TargetSnapshot => {
  let hostIds: string[];
  let label: string;
  if (selection.kind === 'hosts') {
    hostIds = [...selection.hostIds];
    label = '单独主机';
  } else {
    const cluster = clusters.find((item) => item.id === selection.clusterId);
    if (!cluster) throw new Error('所选集群已不存在，请重新选择执行目标');
    const scope = selection.scope;
    if (scope.kind === 'all') {
      hostIds = cluster.members.map((member) => member.hostId);
      label = `${cluster.name} / 全部主机`;
    } else if (scope.kind === 'groups') {
      if (!scope.groups.length) throw new Error('请选择至少一个分组');
      const available = new Set(
        cluster.members.flatMap((member) => member.groups),
      );
      if (scope.groups.some((group) => !available.has(group)))
        throw new Error('所选分组已不存在，请重新选择执行目标');
      hostIds = cluster.members
        .filter((member) =>
          member.groups.some((group) => scope.groups.includes(group)),
        )
        .map((member) => member.hostId);
      label = `${cluster.name} / ${scope.groups.join('、')}`;
    } else {
      const members = new Set(cluster.members.map((member) => member.hostId));
      if (scope.hostIds.some((id) => !members.has(id)))
        throw new Error('所选主机已不属于这个集群，请重新选择执行目标');
      hostIds = [...scope.hostIds];
      label = `${cluster.name} / 指定主机`;
    }
  }
  hostIds = [...new Set(hostIds)];
  if (!hostIds.length)
    throw new Error('此范围没有执行主机，请选择非空集群、分组或指定主机');
  if (hostIds.length > MAX_EXECUTION_HOSTS)
    throw new Error(
      `单次最多执行 ${MAX_EXECUTION_HOSTS} 台主机，请缩小分组或指定部分主机`,
    );
  const available = new Set(hosts.map((host) => host.id));
  if (hostIds.some((id) => !available.has(id)))
    throw new Error('所选主机已被删除，请重新选择执行目标');
  return { selection, label, hostIds };
};
