import type { CreateHostBody, Host } from '@deploy-crab/contracts/host';
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
import { useEffect, useMemo } from 'react';
import { applyServerErrors } from '../../../utils/form-errors';
import { jumpChain, sshCommand } from '../../../utils/ssh';
import { useSaveHost } from '../useInventory';

interface HostFormValues {
  name: string;
  address: string;
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
  address: '',
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
  address: host.address,
  port: host.port,
  user: host.user,
  authMethod: host.auth.method,
  keyPath: host.auth.method === 'key' ? host.auth.keyPath : '',
  jumpHostId: host.jumpHostId,
  labels: host.labels,
  description: host.description,
});

const toBody = (values: HostFormValues): CreateHostBody => ({
  name: values.name,
  address: values.address,
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

  useEffect(() => {
    if (!open) return;
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
          address: candidate.address,
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

  const values = Form.useWatch([], form) as HostFormValues | undefined;
  const preview = values
    ? sshCommand(
        {
          address: values.address?.trim() ?? '',
          port: values.port ?? 22,
          user: values.user?.trim() ?? '',
          auth:
            values.authMethod === 'key'
              ? { method: 'key', keyPath: values.keyPath?.trim() ?? '' }
              : { method: 'agent' },
          jumpHostId: values.jumpHostId ?? null,
        },
        hostById,
      )
    : '';

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
          <div className="grid grid-cols-[1fr_96px] gap-x-3">
            <Form.Item
              name="address"
              label="地址"
              rules={[
                { required: true, whitespace: true, message: '请填写地址' },
              ]}
            >
              <Input placeholder="域名或 IP" />
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
          <Form.Item name="jumpHostId" label="跳板主机" className="mb-4">
            <Select
              allowClear
              placeholder="直连"
              options={jumpOptions}
              optionRender={(option) => (
                <div className="flex items-baseline justify-between gap-3">
                  <span>{option.data.label}</span>
                  <span className="truncate font-mono text-xs text-sand-9">
                    {option.data.address}
                  </span>
                </div>
              )}
              onClear={() => form.setFieldValue('jumpHostId', null)}
              notFoundContent="没有可用作跳板的主机"
            />
          </Form.Item>

          <div className="flex items-start gap-2 rounded-lg bg-sand-12 py-2 pr-1.5 pl-3">
            <code
              className="min-w-0 flex-1 font-mono text-[12.5px] leading-relaxed break-all text-sand-4"
              aria-label="等价的 ssh 命令"
            >
              <span className="text-amber select-none">$ </span>
              {preview}
            </code>
            <CopyButton
              text={preview}
              label="复制 ssh 命令"
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
