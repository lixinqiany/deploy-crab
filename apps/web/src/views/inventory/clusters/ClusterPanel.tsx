import type { Cluster } from '@deploy-crab/contracts/cluster';
import type { Host } from '@deploy-crab/contracts/host';
import { EmptyState } from '@deploy-crab/ui/feedback/EmptyState';
import { ClusterDetail } from './ClusterDetail';
import { ClusterList } from './ClusterList';

interface ClusterPanelProps {
  clusters: Cluster[];
  hostById: ReadonlyMap<string, Host>;
  selected: Cluster | undefined;
  onSelect: (cluster: Cluster) => void;
  onCreate: () => void;
  onEdit: (cluster: Cluster) => void;
  onOpenHost: (host: Host) => void;
}

/** 集群视图：左边选集群，右边看它按分组排好的主机 */
export const ClusterPanel = ({
  clusters,
  hostById,
  selected,
  onSelect,
  onCreate,
  onEdit,
  onOpenHost,
}: ClusterPanelProps) => {
  if (clusters.length === 0) {
    return (
      <EmptyState
        title="还没有集群"
        description="集群是一组一起部署的主机。创建集群后，把主机加进来并按角色分组，例如 web、db。"
        actionLabel="新建集群"
        onAction={onCreate}
      />
    );
  }

  return (
    <div className="grid items-start gap-4 md:grid-cols-[232px_minmax(0,1fr)]">
      <ClusterList
        clusters={clusters}
        selectedId={selected?.id}
        onSelect={onSelect}
      />
      {selected && (
        <ClusterDetail
          cluster={selected}
          hostById={hostById}
          onEdit={() => onEdit(selected)}
          onOpenHost={onOpenHost}
        />
      )}
    </div>
  );
};
