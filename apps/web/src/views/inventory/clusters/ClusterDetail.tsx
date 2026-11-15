import type { Cluster } from '@deploy-crab/contracts/cluster';
import type { Host } from '@deploy-crab/contracts/host';
import { CopyButton } from '@deploy-crab/ui/button/CopyButton';
import {
  DeleteOutlined,
  EditOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { App, Button, Popconfirm } from 'antd';
import { useState } from 'react';
import { ApiRequestError } from '@/api/http';
import { sshCopyProps, sshTarget } from '@/utils/ssh';
import { useDeleteCluster } from '@/views/inventory/useInventory';
import { groupCounts, memberViews } from './groups';

interface ClusterDetailProps {
  cluster: Cluster;
  hostById: ReadonlyMap<string, Host>;
  onEdit: () => void;
  onOpenHost: (host: Host) => void;
}

/**
 * 右侧的集群详情。每台主机只列一次，分组以标签形式写在行内；
 * 上方的分组条可以只看某个分组的主机，部署前核对「web 组有哪几台」时用。
 */
export const ClusterDetail = ({
  cluster,
  hostById,
  onEdit,
  onOpenHost,
}: ClusterDetailProps) => {
  const members = memberViews(cluster, hostById);
  const groups = groupCounts(cluster);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  // 切换集群或编辑后，选中的分组可能已经不存在
  const group = groups.some((item) => item.name === activeGroup)
    ? activeGroup
    : null;
  const visible = group
    ? members.filter(({ member }) => member.groups.includes(group))
    : members;

  return (
    <article
      key={cluster.id}
      className="crab-fade-in flex min-w-0 flex-col rounded-xl border border-sand-4 bg-white"
    >
      <header className="flex items-start justify-between gap-4 border-b border-sand-4 px-5 py-4">
        <div className="min-w-0">
          <h2 className="m-0 truncate text-lg font-semibold text-sand-12">
            {cluster.name}
          </h2>
          <p className="m-0 mt-0.5 text-sm text-sand-11">
            {cluster.description || (
              <span className="text-sand-9">没有描述</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button icon={<EditOutlined />} onClick={onEdit}>
            编辑
          </Button>
          <DeleteClusterButton cluster={cluster} />
        </div>
      </header>

      {members.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-14 text-center">
          <p className="m-0 mb-4 max-w-xs text-sm text-sand-11">
            这个集群还没有主机。添加主机并为它们分组，例如 web、db。
          </p>
          <Button type="primary" onClick={onEdit}>
            添加主机
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 p-5">
          <div
            role="group"
            aria-label="按分组筛选"
            className="flex flex-wrap items-center gap-1.5"
          >
            <FilterChip
              active={group === null}
              onClick={() => setActiveGroup(null)}
              label="全部"
              count={members.length}
            />
            {groups.map(({ name, count }) => (
              <FilterChip
                key={name}
                active={group === name}
                onClick={() => setActiveGroup(group === name ? null : name)}
                label={name}
                count={count}
                mono
              />
            ))}
          </div>

          <ul className="m-0 list-none divide-y divide-sand-4 rounded-lg border border-sand-4 p-0">
            {visible.map(({ host, member }) => {
              if (!host) {
                return (
                  <li
                    key={member.hostId}
                    className="flex items-center gap-2 px-3 py-2.5 text-sm text-amber-text"
                  >
                    <WarningOutlined />
                    引用的主机已不存在（{member.hostId}），请编辑集群移除它
                  </li>
                );
              }
              return (
                <li
                  key={host.id}
                  className="group flex items-center transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-sand-2"
                >
                  <button
                    type="button"
                    onClick={() => onOpenHost(host)}
                    className="flex min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border-0 bg-transparent px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-amber"
                  >
                    <span className="w-40 shrink-0 truncate text-sm font-medium text-sand-12">
                      {host.name}
                    </span>
                    <span className="min-w-40 flex-1 truncate font-mono text-[13px] text-sand-11">
                      {sshTarget(host)}
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {member.groups.map((name) => (
                        <span
                          key={name}
                          className={`rounded-md px-1.5 py-px font-mono text-xs transition-colors ${
                            name === group
                              ? 'bg-amber-soft text-amber-text ring-1 ring-amber-line'
                              : 'bg-sand-3 text-sand-11'
                          }`}
                        >
                          {name}
                        </span>
                      ))}
                    </span>
                  </button>
                  <CopyButton
                    {...sshCopyProps(host, hostById)}
                    className="mr-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </article>
  );
};

interface FilterChipProps {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  mono?: boolean;
}

const FilterChip = ({
  active,
  onClick,
  label,
  count,
  mono,
}: FilterChipProps) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-amber ${
      active
        ? 'border-amber-line bg-amber-soft text-amber-text'
        : 'border-sand-5 bg-white text-sand-11 hover:border-sand-7 hover:text-sand-12'
    }`}
  >
    <span className={mono ? 'font-mono' : ''}>{label}</span>
    <span
      className={`tabular ${active ? 'text-amber-text/70' : 'text-sand-9'}`}
    >
      {count}
    </span>
  </button>
);

const DeleteClusterButton = ({ cluster }: { cluster: Cluster }) => {
  const { message } = App.useApp();
  const deleteCluster = useDeleteCluster();

  const confirm = async () => {
    try {
      await deleteCluster.mutateAsync(cluster.id);
      message.success(`已删除集群 ${cluster.name}`);
    } catch (error) {
      message.error(ApiRequestError.from(error).message);
    }
  };

  return (
    <Popconfirm
      title={`删除集群 ${cluster.name}？`}
      description="只删除集群，其中的主机会保留。"
      okText="删除"
      okButtonProps={{ danger: true, loading: deleteCluster.isPending }}
      cancelText="取消"
      placement="bottomRight"
      onConfirm={() => void confirm()}
    >
      <Button
        type="text"
        icon={<DeleteOutlined />}
        aria-label={`删除集群 ${cluster.name}`}
        className="text-sand-9"
      />
    </Popconfirm>
  );
};
