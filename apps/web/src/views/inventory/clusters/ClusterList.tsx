import type { Cluster } from '@deploy-crab/contracts/cluster';

interface ClusterListProps {
  clusters: Cluster[];
  selectedId: string | undefined;
  onSelect: (cluster: Cluster) => void;
}

const groupCount = (cluster: Cluster) =>
  new Set(cluster.members.flatMap((member) => member.groups)).size;

/** 左侧的集群列表：名称 + 规模，选中项用琥珀色竖条标出 */
export const ClusterList = ({
  clusters,
  selectedId,
  onSelect,
}: ClusterListProps) => (
  <nav aria-label="集群" className="flex flex-col gap-0.5">
    {clusters.map((cluster) => {
      const selected = cluster.id === selectedId;
      return (
        <button
          key={cluster.id}
          type="button"
          aria-current={selected ? 'true' : undefined}
          onClick={() => onSelect(cluster)}
          className={`group relative flex w-full cursor-pointer flex-col items-start rounded-lg border-0 px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-amber ${
            selected
              ? 'bg-white shadow-[0_1px_2px_rgba(33,32,28,0.06)]'
              : 'bg-transparent hover:bg-sand-3'
          }`}
        >
          <span
            aria-hidden
            className={`absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-full transition-colors ${
              selected ? 'bg-amber' : 'bg-transparent'
            }`}
          />
          <span
            className={`w-full truncate text-sm font-medium ${
              selected
                ? 'text-sand-12'
                : 'text-sand-11 group-hover:text-sand-12'
            }`}
          >
            {cluster.name}
          </span>
          <span className="tabular text-xs text-sand-9">
            {cluster.members.length === 0
              ? '空集群'
              : `${cluster.members.length} 台主机 · ${groupCount(cluster)} 个分组`}
          </span>
        </button>
      );
    })}
  </nav>
);
