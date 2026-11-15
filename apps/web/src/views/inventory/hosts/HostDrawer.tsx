import type { HostNetwork } from '@deploy-crab/contracts/enums/host';
import {
  type CreateHostBody,
  defaultConnectVia,
  type Host,
  hostAddressIssues,
} from '@deploy-crab/contracts/host';
import { CopyButton } from '@deploy-crab/ui/button/CopyButton';
import {
  App,
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Segmented,
  Select,
} from 'antd';
import { useEffect, useMemo, useRef } from 'react';
import { applyServerErrors } from '@/utils/form-errors';
import {
  jumpChain,
  type SshEndpoint,
  sshSnippet,
  sshTarget,
} from '@/utils/ssh';
import { useSaveHost } from '@/views/inventory/useInventory';

interface HostFormValues {
  name: string;
  /** 地址在表单里用空字符串表示未填写，提交时转成 `null` */
  publicAddress: string;
  privateAddress: string;
  connectVia: HostNetwork;
  port: number;
  user: string;
  authMethod: 'agent' | 'key';
  keyPath: string;
  jumpHostId: string | null;
  labels: string[];
  description: string;
}

const EMPTY: HostFormValues = {
  name: '',
  publicAddress: '',
  privateAddress: '',
  connectVia: 'public',
  port: 22,
  user: '',
  authMethod: 'agent',
  keyPath: '',
  jumpHostId: null,
  labels: [],
  description: '',
};

const toValues = (host: Host): HostFormValues => ({
  name: host.name,
  publicAddress: host.publicAddress ?? '',
  privateAddress: host.privateAddress ?? '',
  connectVia: host.connectVia,
  port: host.port,
  user: host.user,
  authMethod: host.auth.method,
  keyPath: host.auth.method === 'key' ? host.auth.keyPath : '',
  jumpHostId: host.jumpHostId,
  labels: host.labels,
  description: host.description,
});

const optionalAddress = (value: string | undefined) => value?.trim() || null;

const toBody = (values: HostFormValues): CreateHostBody => ({
  name: values.name,
  publicAddress: optionalAddress(values.publicAddress),
  privateAddress: optionalAddress(values.privateAddress),
  connectVia: values.connectVia,
  port: values.port,
  user: values.user,
  auth:
    values.authMethod === 'key'
      ? { method: 'key', keyPath: values.keyPath }
      : { method: 'agent' },
  jumpHostId: values.jumpHostId,
  labels: values.labels,
  description: values.description,
});

/** 表单里填到一半的值，用来预览 ssh 用法 */
const toEndpoint = (values: Partial<HostFormValues>): SshEndpoint => ({
  name: values.name?.trim() ?? '',
  publicAddress: optionalAddress(values.publicAddress),
  privateAddress: optionalAddress(values.privateAddress),
  connectVia: values.connectVia ?? 'public',
  port: values.port ?? 22,
  user: values.user?.trim() ?? '',
  auth:
    values.authMethod === 'key'
      ? { method: 'key', keyPath: values.keyPath?.trim() ?? '' }
      : { method: 'agent' },
  jumpHostId: values.jumpHostId ?? null,
});

const NETWORK_LABEL: Record<HostNetwork, string> = {
  public: '外网',
  private: '内网',
};

/** 服务端的 `auth.keyPath` 对应表单里的 `keyPath` */
const toFieldPath = (path: (string | number)[]) =>
  path[0] === 'auth' ? ['keyPath'] : path;

interface HostDrawerProps {
  /** `undefined` 关闭，`null` 新建，传入主机则编辑 */
  host: Host | null | undefined;
  hosts: Host[];
  onClose: () => void;
}

export const HostDrawer = ({ host, hosts, onClose }: HostDrawerProps) => {
  const { message } = App.useApp();
  const [form] = Form.useForm<HostFormValues>();
  const save = useSaveHost();
  const open = host !== undefined;
  const editing = host ?? null;

  /** 用户亲手选过连接方式后，不再自动切换 */
  const connectViaChosen = useRef(false);

  useEffect(() => {
    if (!open) return;
    connectViaChosen.current = editing !== null;
    form.resetFields();
    form.setFieldsValue(editing ? toValues(editing) : EMPTY);
  }, [open, editing, form]);

  const hostById = useMemo(
    () => new Map(hosts.map((item) => [item.id, item])),
    [hosts],
  );

  // 跳板候选：排除自己，以及经由自己连接的主机（选它们会形成环）
  const jumpOptions = useMemo(
    () =>
      hosts
        .filter(
          (candidate) =>
            !editing ||
            (candidate.id !== editing.id &&
              !jumpChain(candidate, hostById).some(
                (step) => step.id === editing.id,
              )),
        )
        .map((candidate) => ({
          value: candidate.id,
          label: candidate.name,
          target: sshTarget(candidate),
        })),
    [hosts, editing, hostById],
  );

  const labelOptions = useMemo(
    () =>
      [...new Set(hosts.flatMap((item) => item.labels))]
        .sort()
        .map((label) => ({ value: label })),
    [hosts],
  );

  const values = Form.useWatch([], form) as Partial<HostFormValues> | undefined;
  const endpoint = toEndpoint(values ?? EMPTY);
  const preview = sshSnippet(endpoint, hostById);
  const jump = endpoint.jumpHostId ? hostById.get(endpoint.jumpHostId) : null;

  /**
   * 用户没有手动选过连接方式时，按地址和跳板自动选默认值：
   * 只填了一个地址就用它，两个都填了则经跳板走内网、直连走外网。
   */
  const syncConnectVia = () => {
    if (connectViaChosen.current) return;
    form.setFieldsValue({
      connectVia: defaultConnectVia({
        publicAddress: optionalAddress(
          form.getFieldValue('publicAddress') as string,
        ),
        privateAddress: optionalAddress(
          form.getFieldValue('privateAddress') as string,
        ),
        jumpHostId: (form.getFieldValue('jumpHostId') as string | null) ?? null,
      }),
    });
  };

  /** 地址的组合规则直接用 contracts 的 `hostAddressIssues`，前后端一致 */
  const addressRule = (field: 'publicAddress' | 'privateAddress') => ({
    validator: () => {
      const issue = hostAddressIssues(toEndpoint(form.getFieldsValue())).find(
        ({ path }) => path[0] === field,
      );
      return issue
        ? Promise.reject(new Error(issue.message))
        : Promise.resolve();
    },
  });

  const addressLabel = (network: HostNetwork) => (
    <span className="inline-flex items-center gap-1.5">
      {NETWORK_LABEL[network]}地址
      {endpoint.connectVia === network && (
        <span className="crab-fade-in rounded bg-amber-soft px-1.5 text-[11px] leading-[18px] font-medium text-amber-text">
          SSH 连接
        </span>
      )}
    </span>
  );

  const submit = async (formValues: HostFormValues) => {
    try {
      const saved = await save.mutateAsync({
        ...(editing && { id: editing.id }),
        body: toBody(formValues),
      });
      message.success(
        editing ? `已保存 ${saved.name}` : `已添加 ${saved.name}`,
      );
      onClose();
    } catch (error) {
      const text = applyServerErrors(form, error, (issue) =>
        toFieldPath(issue.path),
      );
      if (text) message.error(text);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={520}
      destroyOnHidden
      title={editing ? `编辑 ${editing.name}` : '添加主机'}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>取消</Button>
          <Button
            type="primary"
            loading={save.isPending}
            onClick={() => form.submit()}
          >
            {editing ? '保存' : '添加主机'}
          </Button>
        </div>
      }
    >
      <Form<HostFormValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={EMPTY}
        onFinish={(formValues) => void submit(formValues)}
        onValuesChange={(changed: Partial<HostFormValues>) => {
          if (
            'publicAddress' in changed ||
            'privateAddress' in changed ||
            'jumpHostId' in changed
          ) {
            syncConnectVia();
          }
        }}
      >
        <Form.Item
          name="name"
          label="名称"
          rules={[{ required: true, whitespace: true, message: '请填写名称' }]}
        >
          <Input placeholder="例如 web-1" autoFocus maxLength={64} />
        </Form.Item>

        <section className="mb-5 rounded-xl border border-sand-4 bg-sand-2 p-4">
          <h3 className="mb-3 text-[13px] font-semibold text-sand-12">
            SSH 连接
          </h3>
          <div className="grid grid-cols-2 gap-x-3">
            <Form.Item
              name="publicAddress"
              label={addressLabel('public')}
              dependencies={['connectVia', 'privateAddress']}
              rules={[addressRule('publicAddress')]}
            >
              <Input placeholder="公网 IP 或域名" className="font-mono" />
            </Form.Item>
            <Form.Item
              name="privateAddress"
              label={addressLabel('private')}
              dependencies={['connectVia', 'publicAddress']}
              rules={[addressRule('privateAddress')]}
            >
              <Input placeholder="例如 10.0.1.11" className="font-mono" />
            </Form.Item>
          </div>
          <Form.Item name="jumpHostId" label="跳板主机">
            <Select
              allowClear
              showSearch={{ optionFilterProp: 'label' }}
              placeholder="直连"
              options={jumpOptions}
              optionRender={(option) => (
                <div className="flex items-baseline justify-between gap-3">
                  <span>{option.data.label}</span>
                  <span className="truncate font-mono text-xs text-sand-9">
                    {option.data.target}
                  </span>
                </div>
              )}
              onClear={() => form.setFieldValue('jumpHostId', null)}
              notFoundContent="没有可用作跳板的主机"
            />
          </Form.Item>
          <div className="grid grid-cols-[1fr_96px] gap-x-3">
            <Form.Item
              name="connectVia"
              label="连接方式"
              extra={
                jump
                  ? `由 ${jump.name} 去连这个地址，通常走内网`
                  : '由运行 Deploy Crab 的机器去连这个地址'
              }
            >
              <Segmented
                block
                onChange={() => {
                  connectViaChosen.current = true;
                }}
                options={[
                  { value: 'public', label: '经外网' },
                  { value: 'private', label: '经内网' },
                ]}
              />
            </Form.Item>
            <Form.Item name="port" label="端口">
              <InputNumber
                min={1}
                max={65535}
                precision={0}
                className="w-full"
              />
            </Form.Item>
          </div>
          <Form.Item
            name="user"
            label="登录用户"
            rules={[
              { required: true, whitespace: true, message: '请填写登录用户' },
            ]}
          >
            <Input placeholder="例如 deploy" />
          </Form.Item>
          <Form.Item name="authMethod" label="认证方式">
            <Segmented
              block
              options={[
                { value: 'agent', label: 'ssh-agent' },
                { value: 'key', label: '私钥文件' },
              ]}
            />
          </Form.Item>
          {values?.authMethod === 'key' && (
            <Form.Item
              name="keyPath"
              label="私钥路径"
              extra="运行 Deploy Crab 的机器上的路径，不会读取或保存私钥内容。"
              rules={[
                { required: true, whitespace: true, message: '请填写私钥路径' },
              ]}
            >
              <Input placeholder="~/.ssh/id_ed25519" className="font-mono" />
            </Form.Item>
          )}
          <div className="flex items-start gap-2 rounded-lg bg-sand-12 py-2 pr-1.5 pl-3">
            <code
              className="min-w-0 flex-1 font-mono text-[12.5px] leading-relaxed break-all whitespace-pre-wrap text-sand-4"
              aria-label={
                preview.kind === 'command'
                  ? '等价的 ssh 命令'
                  : '等价的 ssh 配置'
              }
            >
              {preview.kind === 'command' && (
                <span className="text-amber select-none">$ </span>
              )}
              {preview.text}
            </code>
            <CopyButton
              text={preview.text}
              label={
                preview.kind === 'command' ? '复制 ssh 命令' : '复制 ssh 配置'
              }
              className="text-sand-7 hover:bg-white/10 hover:text-white"
            />
          </div>
        </section>

        <Form.Item name="labels" label="标签">
          <Select
            mode="tags"
            placeholder="用于筛选，例如 nginx、prod"
            options={labelOptions}
            tokenSeparators={[',', ' ']}
          />
        </Form.Item>
        <Form.Item name="description" label="描述">
          <Input.TextArea
            placeholder="这台机器做什么用"
            autoSize={{ minRows: 2, maxRows: 5 }}
            maxLength={500}
          />
        </Form.Item>
      </Form>
    </Drawer>
  );
};
