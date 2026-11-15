import type { Cluster } from '@deploy-crab/contracts/cluster';
import type { Host } from '@deploy-crab/contracts/host';
import { CopyButton } from '@deploy-crab/ui/button/CopyButton';
import { EmptyState } from '@deploy-crab/ui/feedback/EmptyState';
import { DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Input,
  Popconfirm,
  Table,
  type TableColumnsType,
  Tag,
  Tooltip,
} from 'antd';
import { useMemo, useState } from 'react';
import { ApiRequestError } from '../../../api/http';
import { sshCommand, sshTarget } from '../../../utils/ssh';
import { useDeleteHost } from '../useInventory';

/** 名称、地址、用户、标签任一包含关键字即匹配，不区分大小写 */
const matches = (host: Host, keyword: string) =>
  [host.name, host.address, host.user, ...host.labels].some((value) =>
    value.toLowerCase().includes(keyword),
  );

interface HostTableProps {
  hosts: Host[];
  hostById: ReadonlyMap<string, Host>;
  clustersByHost: ReadonlyMap<string, Cluster[]>;
  onEdit: (host: Host) => void;
  onCreate: () => void;
  onOpenCluster: (cluster: Cluster) => void;
}

export const HostTable = ({
  hosts,
  hostById,
  clustersByHost,
  onEdit,
  onCreate,
  onOpenCluster,
}: HostTableProps) => {
  const [keyword, setKeyword] = useState('');
  const filtered = useMemo(() => {
    const value = keyword.trim().toLowerCase();
    return value ? hosts.filter((host) => matches(host, value)) : hosts;
  }, [hosts, keyword]);

  if (hosts.length === 0) {
    return (
      <EmptyState
        title="还没有主机"
        description="添加一台能用 SSH 登录的机器。主机可以单独存在，也可以加入一个或多个集群。"
        actionLabel="添加主机"
        onAction={onCreate}
      />
    );
  }

  const columns: TableColumnsType<Host> = [
    {
      title: '名称',
      dataIndex: 'name',
      render: (_, host) => (
        <div className="min-w-0 max-w-64">
          <div className="truncate font-medium text-sand-12">{host.name}</div>
          {host.description && (
            <div className="truncate text-xs text-sand-9">
              {host.description}
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'SSH',
      key: 'ssh',
      render: (_, host) => {
        const jump = host.jumpHostId ? hostById.get(host.jumpHostId) : null;
        return (
          <div className="group flex items-center gap-1">
            <div className="min-w-0">
              <div className="font-mono text-[13px] text-sand-12">
                {sshTarget(host)}
              </div>
              <div className="text-xs text-sand-9">
                {jump ? `经由 ${jump.name}` : '直连'}
                {' · '}
                {host.auth.method === 'agent' ? 'ssh-agent' : '私钥文件'}
              </div>
            </div>
            <CopyButton
              text={sshCommand(host, hostById)}
              label={`复制 ${host.name} 的 ssh 命令`}
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            />
          </div>
        );
      },
    },
    {
      title: '所属集群',
      key: 'clusters',
      render: (_, host) => {
        const owners = clustersByHost.get(host.id) ?? [];
        if (owners.length === 0) {
          return <span className="text-sand-9">未加入</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {owners.map((cluster) => (
              <button
                key={cluster.id}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenCluster(cluster);
                }}
                className="cursor-pointer rounded-md border-0 bg-amber-soft px-2 py-0.5 text-xs font-medium text-amber-text transition-colors hover:bg-amber-line/40 focus-visible:outline-2 focus-visible:outline-amber"
              >
                {cluster.name}
              </button>
            ))}
          </div>
        );
      },
    },
    {
      title: '标签',
      dataIndex: 'labels',
      render: (labels: string[]) => (
        <div className="flex flex-wrap gap-1">
          {labels.map((label) => (
            <Tag key={label} className="m-0">
              {label}
            </Tag>
          ))}
        </div>
      ),
    },
    {
      key: 'actions',
      width: 48,
      align: 'right',
      render: (_, host) => <DeleteHostButton host={host} />,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <Input
        allowClear
        prefix={<SearchOutlined className="text-sand-9" />}
        placeholder="按名称、地址、用户或标签筛选"
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
        className="max-w-xs"
      />
      <div className="overflow-hidden rounded-xl border border-sand-4 bg-white">
        <Table<Host>
          rowKey="id"
          columns={columns}
          dataSource={filtered}
          pagination={false}
          scroll={{ x: 'max-content' }}
          onRow={(host) => ({
            onClick: () => onEdit(host),
            className: 'cursor-pointer',
          })}
          locale={{
            emptyText: (
              <div className="py-8 text-sand-9">
                没有匹配“{keyword.trim()}”的主机
              </div>
            ),
          }}
        />
      </div>
    </div>
  );
};

/** 删除前确认；被跳板或集群引用时，服务端会拒绝并说明原因 */
const DeleteHostButton = ({ host }: { host: Host }) => {
  const { message } = App.useApp();
  const deleteHost = useDeleteHost();

  const confirm = async () => {
    try {
      await deleteHost.mutateAsync(host.id);
      message.success(`已删除 ${host.name}`);
    } catch (error) {
      message.error(ApiRequestError.from(error).message);
    }
  };

  return (
    // 删除区域不应触发整行的「打开编辑」
    <div onClick={(event) => event.stopPropagation()}>
      <Popconfirm
        title={`删除 ${host.name}？`}
        description="删除后无法恢复。"
        okText="删除"
        okButtonProps={{ danger: true, loading: deleteHost.isPending }}
        cancelText="取消"
        placement="left"
        onConfirm={() => void confirm()}
      >
        <Tooltip title="删除" mouseEnterDelay={0.4}>
          <Button
            type="text"
            size="small"
            icon={<DeleteOutlined />}
            aria-label={`删除 ${host.name}`}
            className="text-sand-9"
          />
        </Tooltip>
      </Popconfirm>
    </div>
  );
};
