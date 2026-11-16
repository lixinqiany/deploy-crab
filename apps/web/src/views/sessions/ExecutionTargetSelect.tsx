import type { Cluster } from '@deploy-crab/contracts/cluster';
import { connectAddress, type Host } from '@deploy-crab/contracts/host';
import {
  MAX_EXECUTION_HOSTS,
  type TargetSelection,
  type TargetSnapshot,
} from '@deploy-crab/contracts/execution-target';
import {
  ApartmentOutlined,
  HddOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { Alert, Button, Empty, Popover, Segmented, Select, Tag } from 'antd';
import { useState } from 'react';
import styles from './SessionWorkspace.module.css';
import { previewTarget } from './session-target-model';

interface Props {
  value: TargetSelection | undefined;
  preview: TargetSnapshot | null;
  clusters: Cluster[];
  hosts: Host[];
  loading: boolean;
  error: string;
  disabled: boolean;
  refresh: () => void;
  onChange: (value: TargetSelection | undefined) => void;
}

const TargetPicker = ({
  value,
  clusters,
  hosts,
  loading,
  error,
  refresh,
  onSelect,
  onCancel,
}: Omit<Props, 'preview' | 'disabled' | 'onChange'> & {
  onSelect: (value: TargetSelection | undefined) => void;
  onCancel: () => void;
}) => {
  const [selection, setSelection] = useState(value);
  const [mode, setMode] = useState<'cluster' | 'hosts'>(
    value?.kind ?? 'cluster',
  );
  const clusterSelection =
    selection?.kind === 'cluster' ? selection : undefined;
  const cluster = clusters.find(
    (cluster) => cluster.id === clusterSelection?.clusterId,
  );
  const groups = [
    ...new Set(cluster?.members.flatMap((member) => member.groups) ?? []),
  ].sort();
  const members = new Set(
    cluster?.members.map((member) => member.hostId) ?? [],
  );
  const hostOptions = (items: Host[]) =>
    items.map((host) => ({
      value: host.id,
      label: `${host.name} · ${host.user}@${connectAddress(host)}`,
    }));
  const preview = previewTarget(selection, clusters, hosts);
  const selectedIds = new Set(preview.value?.hostIds ?? []);
  const selectScope = (
    scope: NonNullable<typeof clusterSelection>['scope'],
  ) => {
    if (clusterSelection) setSelection({ ...clusterSelection, scope });
  };
  return (
    <div
      role="dialog"
      aria-label="执行目标选择器"
      className="w-[min(440px,calc(100vw-48px))]"
    >
      <div className="flex items-center justify-between border-b border-sand-4 px-4 py-3">
        <span className="font-medium">选择执行目标</span>
        <Button
          type="text"
          size="small"
          icon={<ReloadOutlined />}
          aria-label="刷新执行目标"
          loading={loading}
          onClick={refresh}
        />
      </div>
      <div className="space-y-4 p-4">
        <Segmented
          block
          aria-label="目标类型"
          value={mode}
          options={[
            { label: '按集群', value: 'cluster', icon: <ApartmentOutlined /> },
            { label: '单独主机', value: 'hosts', icon: <HddOutlined /> },
          ]}
          onChange={(value: 'cluster' | 'hosts') => {
            setMode(value);
            setSelection(
              value === 'hosts' ? { kind: 'hosts', hostIds: [] } : undefined,
            );
          }}
        />
        {mode === 'cluster' ? (
          <>
            <Select
              className="w-full"
              aria-label="执行集群"
              placeholder="选择集群"
              showSearch={{ optionFilterProp: 'label' }}
              loading={loading}
              value={clusterSelection?.clusterId ?? null}
              options={clusters.map((cluster) => ({
                value: cluster.id,
                label: `${cluster.name} · ${cluster.members.length} 台`,
              }))}
              onChange={(clusterId: string) =>
                setSelection({
                  kind: 'cluster',
                  clusterId,
                  scope: { kind: 'all' },
                })
              }
            />
            {!clusters.length && !loading && !error && (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="还没有集群，可以切换到「单独主机」"
              />
            )}
            {cluster && (
              <>
                <Segmented
                  block
                  aria-label="集群执行范围"
                  value={clusterSelection?.scope.kind ?? 'all'}
                  options={[
                    { label: '全部成员', value: 'all' },
                    { label: '按分组', value: 'groups' },
                    { label: '指定主机', value: 'hosts' },
                  ]}
                  onChange={(kind: 'all' | 'groups' | 'hosts') =>
                    selectScope(
                      kind === 'groups'
                        ? { kind, groups: [] }
                        : kind === 'hosts'
                          ? { kind, hostIds: [] }
                          : { kind },
                    )
                  }
                />
                {clusterSelection?.scope.kind === 'groups' && (
                  <Select
                    mode="multiple"
                    className="w-full"
                    aria-label="执行分组"
                    placeholder="选择一个或多个分组"
                    value={clusterSelection.scope.groups}
                    showSearch={{ optionFilterProp: 'label' }}
                    options={groups.map((group) => ({
                      value: group,
                      label: `${group} · ${cluster.members.filter((member) => member.groups.includes(group)).length} 台`,
                    }))}
                    onChange={(groups: string[]) =>
                      selectScope({ kind: 'groups', groups })
                    }
                  />
                )}
                {clusterSelection?.scope.kind === 'hosts' && (
                  <Select
                    mode="multiple"
                    maxCount={MAX_EXECUTION_HOSTS}
                    className="w-full"
                    aria-label="集群内执行主机"
                    placeholder="从这个集群选择主机"
                    value={clusterSelection.scope.hostIds}
                    showSearch={{ optionFilterProp: 'label' }}
                    options={hostOptions(
                      hosts.filter((host) => members.has(host.id)),
                    )}
                    onChange={(hostIds: string[]) =>
                      selectScope({ kind: 'hosts', hostIds })
                    }
                  />
                )}
              </>
            )}
          </>
        ) : (
          <Select
            mode="multiple"
            maxCount={MAX_EXECUTION_HOSTS}
            className="w-full"
            aria-label="单独执行主机"
            placeholder="选择一台或多台主机"
            loading={loading}
            value={selection?.kind === 'hosts' ? selection.hostIds : []}
            showSearch={{ optionFilterProp: 'label' }}
            options={hostOptions(hosts)}
            onChange={(hostIds: string[]) =>
              setSelection({ kind: 'hosts', hostIds })
            }
          />
        )}
        {error ? (
          <Alert type="error" title={error} />
        ) : preview.error && !loading ? (
          <Alert type="warning" title={preview.error} />
        ) : null}
        {preview.value && (
          <section
            aria-label="执行目标预览"
            className="rounded-lg border border-sand-4 bg-sand-2 p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate font-medium">
                {preview.value.label}
              </span>
              <span className="shrink-0 text-sand-11">
                {preview.value.hostIds.length} 台主机
              </span>
            </div>
            <ul className="m-0 max-h-40 list-none space-y-2 overflow-y-auto p-0">
              {hosts
                .filter((host) => selectedIds.has(host.id))
                .map((host) => (
                  <li key={host.id} className="text-xs leading-5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <HddOutlined />
                      <span>{host.name}</span>
                      {cluster?.members
                        .find((member) => member.hostId === host.id)
                        ?.groups.map((group) => (
                          <Tag className="m-0" key={group}>
                            {group}
                          </Tag>
                        ))}
                    </div>
                    <div className="pl-5 text-sand-9">
                      {host.user}@{connectAddress(host)}
                    </div>
                  </li>
                ))}
            </ul>
          </section>
        )}
        <p className="m-0 text-xs leading-5 text-sand-9">
          提交时固定主机名单。多个分组中的同一台主机只执行一次；每台主机独立反馈结果。
        </p>
      </div>
      <div className="flex items-center gap-2 border-t border-sand-4 px-4 py-3">
        <Button
          type="text"
          size="small"
          disabled={!value}
          onClick={() => onSelect(undefined)}
        >
          清除目标
        </Button>
        <span className="flex-1" />
        <Button onClick={onCancel}>取消</Button>
        <Button
          type="primary"
          disabled={!preview.value || loading || !!error}
          onClick={() => onSelect(selection)}
        >
          使用此目标
        </Button>
      </div>
    </div>
  );
};

export const ExecutionTargetSelect = ({
  value,
  preview,
  clusters,
  hosts,
  loading,
  error,
  disabled,
  refresh,
  onChange,
}: Props) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open && !disabled}
      onOpenChange={(open) => {
        setOpen(open);
        if (open) refresh();
      }}
      trigger="click"
      placement="topLeft"
      arrow={false}
      destroyOnHidden
      styles={{ container: { padding: 0 } }}
      content={
        <TargetPicker
          value={value}
          clusters={clusters}
          hosts={hosts}
          loading={loading}
          error={error}
          refresh={refresh}
          onCancel={() => setOpen(false)}
          onSelect={(next) => {
            onChange(next);
            setOpen(false);
          }}
        />
      }
    >
      <Button
        type="text"
        className={styles.toolButton ?? ''}
        icon={value?.kind === 'hosts' ? <HddOutlined /> : <ApartmentOutlined />}
        disabled={disabled}
        aria-label="选择执行目标"
        title={preview?.label}
      >
        <span className="max-w-[min(340px,45vw)] truncate">
          {preview
            ? `${preview.label} · ${preview.hostIds.length} 台`
            : value
              ? '目标待调整'
              : '执行目标'}
        </span>
      </Button>
    </Popover>
  );
};
