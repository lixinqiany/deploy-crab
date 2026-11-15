import type { Cluster } from '@deploy-crab/contracts/cluster';
import type { Host } from '@deploy-crab/contracts/host';
import { Page } from '@deploy-crab/ui/layout/page/Page';
import { PlusOutlined } from '@ant-design/icons';
import { Alert, Button, Segmented, Skeleton } from 'antd';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { ClusterDrawer } from './clusters/ClusterDrawer';
import { ClusterPanel } from './clusters/ClusterPanel';
import { allGroupNames } from './clusters/groups';
import { HostDrawer } from './hosts/HostDrawer';
import { HostTable } from './hosts/HostTable';
import { useClusters, useHosts, useInventoryIndex } from './useInventory';

type Tab = 'clusters' | 'hosts';

/**
 * 集群管理：集群和主机两个视图放在同一页，用分段控件切换。
 * 当前视图和选中的集群记在 URL 上（`?tab=hosts`、`?cluster=<id>`），刷新和后退都能回到原处。
 */
export const InventoryView = () => {
  const hostsQuery = useHosts();
  const clustersQuery = useClusters();
  const hosts = hostsQuery.data ?? [];
  const clusters = clustersQuery.data ?? [];
  const { hostById, clustersByHost } = useInventoryIndex(hosts, clusters);

  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'hosts' ? 'hosts' : 'clusters';
  const selected =
    clusters.find((cluster) => cluster.id === params.get('cluster')) ??
    clusters[0];

  /** `undefined` 关闭，`null` 新建，否则编辑 */
  const [editingHost, setEditingHost] = useState<Host | null>();
  const [editingCluster, setEditingCluster] = useState<Cluster | null>();

  const go = (next: { tab?: Tab; cluster?: string }) => {
    const search = new URLSearchParams();
    const nextTab = next.tab ?? tab;
    if (nextTab === 'hosts') search.set('tab', 'hosts');
    const clusterId = next.cluster ?? selected?.id;
    if (nextTab === 'clusters' && clusterId) search.set('cluster', clusterId);
    setParams(search, { replace: next.tab === undefined });
  };

  const loading = hostsQuery.isPending || clustersQuery.isPending;
  const error = hostsQuery.error ?? clustersQuery.error;

  return (
    <Page title="集群管理">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented<Tab>
            value={tab}
            onChange={(value) => go({ tab: value })}
            options={[
              {
                value: 'clusters',
                label: (
                  <TabLabel
                    text="集群"
                    count={clusters.length}
                    loading={loading}
                  />
                ),
              },
              {
                value: 'hosts',
                label: (
                  <TabLabel
                    text="主机"
                    count={hosts.length}
                    loading={loading}
                  />
                ),
              },
            ]}
          />
          {tab === 'clusters' ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setEditingCluster(null)}
            >
              新建集群
            </Button>
          ) : (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setEditingHost(null)}
            >
              添加主机
            </Button>
          )}
        </div>

        {error ? (
          <Alert
            type="error"
            showIcon
            message="数据加载失败"
            description={error.message}
            action={
              <Button
                onClick={() => {
                  void hostsQuery.refetch();
                  void clustersQuery.refetch();
                }}
              >
                重试
              </Button>
            }
          />
        ) : loading ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : tab === 'clusters' ? (
          <ClusterPanel
            clusters={clusters}
            hostById={hostById}
            selected={selected}
            onSelect={(cluster) => go({ cluster: cluster.id })}
            onCreate={() => setEditingCluster(null)}
            onEdit={setEditingCluster}
            onOpenHost={setEditingHost}
          />
        ) : (
          <HostTable
            hosts={hosts}
            hostById={hostById}
            clustersByHost={clustersByHost}
            onEdit={setEditingHost}
            onCreate={() => setEditingHost(null)}
            onOpenCluster={(cluster) =>
              go({ tab: 'clusters', cluster: cluster.id })
            }
          />
        )}
      </div>

      <HostDrawer
        host={editingHost}
        hosts={hosts}
        onClose={() => setEditingHost(undefined)}
      />
      <ClusterDrawer
        cluster={editingCluster}
        hosts={hosts}
        groupSuggestions={allGroupNames(clusters)}
        onClose={() => setEditingCluster(undefined)}
        onSaved={(cluster) => go({ tab: 'clusters', cluster: cluster.id })}
      />
    </Page>
  );
};

const TabLabel = ({
  text,
  count,
  loading,
}: {
  text: string;
  count: number;
  loading: boolean;
}) => (
  <span className="inline-flex items-center gap-1.5 px-1">
    {text}
    {!loading && (
      <span className="tabular min-w-5 rounded-full bg-sand-3 px-1.5 text-xs leading-5 text-sand-11">
        {count}
      </span>
    )}
  </span>
);
