import type { Cluster, ClusterMember } from '@deploy-crab/contracts/cluster';
import type { Host } from '@deploy-crab/contracts/host';
import { CloseOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Drawer, Form, Input, Select } from 'antd';
import { useEffect, useMemo } from 'react';
import { applyServerErrors } from '@/utils/form-errors';
import { sshTarget } from '@/utils/ssh';
import { useSaveCluster } from '@/views/inventory/useInventory';

interface ClusterFormValues {
  name: string;
  description: string;
  members: ClusterMember[];
}

const EMPTY: ClusterFormValues = { name: '', description: '', members: [] };

/** 和 contracts 中的 ClusterGroup 规则一致，输入时就提示，不必等提交 */
const GROUP_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface ClusterDrawerProps {
  /** `undefined` 关闭，`null` 新建，传入集群则编辑 */
  cluster: Cluster | null | undefined;
  hosts: Host[];
  groupSuggestions: string[];
  onClose: () => void;
  onSaved: (cluster: Cluster) => void;
}

export const ClusterDrawer = ({
  cluster,
  hosts,
  groupSuggestions,
  onClose,
  onSaved,
}: ClusterDrawerProps) => {
  const { message } = App.useApp();
  const [form] = Form.useForm<ClusterFormValues>();
  const save = useSaveCluster();
  const open = cluster !== undefined;
  const editing = cluster ?? null;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(
      editing
        ? {
            name: editing.name,
            description: editing.description,
            members: editing.members,
          }
        : EMPTY,
    );
  }, [open, editing, form]);

  const hostById = useMemo(
    () => new Map(hosts.map((host) => [host.id, host])),
    [hosts],
  );
  const members =
    (Form.useWatch('members', form) as ClusterMember[] | undefined) ?? [];
  const memberIds = new Set(members.map((member) => member.hostId));
  const candidates = hosts.filter((host) => !memberIds.has(host.id));

  // 候选分组：其他集群用过的 + 本集群已填的，方便保持命名一致
  const groupOptions = [
    ...new Set([
      ...groupSuggestions,
      ...members.flatMap((member) => member.groups ?? []),
    ]),
  ]
    .sort()
    .map((value) => ({ value }));

  /** 新加入的主机默认沿用上一台的分组，连续添加同一组的机器时少点几下 */
  const addHost = (hostId: string) => {
    const lastGroups = members.at(-1)?.groups ?? [];
    form.setFieldValue('members', [...members, { hostId, groups: lastGroups }]);
  };

  const submit = async (values: ClusterFormValues) => {
    try {
      const saved = await save.mutateAsync({
        ...(editing && { id: editing.id }),
        body: values,
      });
      message.success(
        editing ? `已保存 ${saved.name}` : `已创建 ${saved.name}`,
      );
      onSaved(saved);
      onClose();
    } catch (error) {
      const text = applyServerErrors(form, error);
      if (text) message.error(text);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={600}
      destroyOnHidden
      title={editing ? `编辑 ${editing.name}` : '新建集群'}
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="tabular text-xs text-sand-9">
            {members.length} 台主机
          </span>
          <div className="flex gap-2">
            <Button onClick={onClose}>取消</Button>
            <Button
              type="primary"
              loading={save.isPending}
              onClick={() => form.submit()}
            >
              {editing ? '保存' : '创建集群'}
            </Button>
          </div>
        </div>
      }
    >
      <Form<ClusterFormValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={EMPTY}
        onFinish={(values) => void submit(values)}
      >
        <Form.Item
          name="name"
          label="名称"
          rules={[{ required: true, whitespace: true, message: '请填写名称' }]}
        >
          <Input placeholder="例如 prod" autoFocus maxLength={64} />
        </Form.Item>
        <Form.Item name="description" label="描述">
          <Input placeholder="例如 生产环境" maxLength={500} />
        </Form.Item>

        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="m-0 text-sm font-medium text-sand-11">主机与分组</h3>
          <span className="text-xs text-sand-9">一台主机可以属于多个分组</span>
        </div>

        <Form.List name="members">
          {(fields, { remove }) => (
            <div className="flex flex-col gap-2">
              {fields.map((field) => {
                const member = members[field.name];
                const host = member ? hostById.get(member.hostId) : undefined;
                return (
                  <div
                    key={field.key}
                    className="crab-fade-in flex items-start gap-3 rounded-lg border border-sand-4 bg-sand-2 px-3 py-2"
                  >
                    {/* hostId 不显示但要注册成字段，否则提交和 useWatch 都会丢掉它 */}
                    <Form.Item name={[field.name, 'hostId']} noStyle>
                      <input type="hidden" />
                    </Form.Item>
                    <div className="w-36 shrink-0 pt-1.5">
                      <div className="truncate text-sm font-medium text-sand-12">
                        {host?.name ?? '已删除的主机'}
                      </div>
                      <div className="truncate font-mono text-xs text-sand-9">
                        {host ? sshTarget(host) : member?.hostId}
                      </div>
                    </div>
                    <Form.Item
                      name={[field.name, 'groups']}
                      className="mb-0 min-w-0 flex-1"
                      rules={[
                        {
                          required: true,
                          type: 'array',
                          min: 1,
                          message: '至少选择一个分组',
                        },
                        {
                          validator: (_, groups: string[] = []) => {
                            const bad = groups.find(
                              (group) => !GROUP_PATTERN.test(group),
                            );
                            return bad
                              ? Promise.reject(
                                  new Error(
                                    `“${bad}”不可用：分组只能包含小写字母、数字和 -`,
                                  ),
                                )
                              : Promise.resolve();
                          },
                        },
                      ]}
                    >
                      <Select
                        mode="tags"
                        placeholder="输入分组，如 web"
                        options={groupOptions}
                        tokenSeparators={[',', ' ']}
                        aria-label={`${host?.name ?? '主机'} 的分组`}
                      />
                    </Form.Item>
                    <Button
                      type="text"
                      icon={<CloseOutlined />}
                      aria-label={`从集群移除 ${host?.name ?? '主机'}`}
                      onClick={() => remove(field.name)}
                      className="mt-0.5 text-sand-9"
                    />
                  </div>
                );
              })}

              {hosts.length === 0 ? (
                <p className="m-0 rounded-lg border border-dashed border-sand-6 px-3 py-4 text-center text-sm text-sand-11">
                  还没有主机。先在「主机」页添加，再回来把它们加入集群。
                </p>
              ) : candidates.length === 0 ? (
                <p className="m-0 py-1 text-xs text-sand-9">
                  全部主机都已加入这个集群。
                </p>
              ) : (
                <Select<string>
                  showSearch
                  value={null}
                  aria-label="添加主机到集群"
                  placeholder={
                    <span className="inline-flex items-center gap-1.5 text-sand-11">
                      <PlusOutlined />
                      添加主机
                      <span className="text-sand-9">
                        · 还有 {candidates.length} 台可选
                      </span>
                    </span>
                  }
                  optionFilterProp="search"
                  options={candidates.map((host) => ({
                    value: host.id,
                    label: host.name,
                    search: [
                      host.name,
                      host.publicAddress,
                      host.privateAddress,
                      ...host.labels,
                    ].join(' '),
                    target: sshTarget(host),
                  }))}
                  optionRender={(option) => (
                    <div className="flex items-baseline justify-between gap-3">
                      <span>{option.data.label}</span>
                      <span className="truncate font-mono text-xs text-sand-9">
                        {option.data.target}
                      </span>
                    </div>
                  )}
                  onChange={addHost}
                  className="crab-add-select w-full"
                />
              )}
            </div>
          )}
        </Form.List>
      </Form>
    </Drawer>
  );
};
