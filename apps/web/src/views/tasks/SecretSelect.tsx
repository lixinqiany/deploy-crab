import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Form, Input, Modal, Select, Switch } from 'antd';
import type { SecretSummary } from '@deploy-crab/contracts/secret';
import { http } from '@/api/http';

export const SecretSelect = ({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) => {
  const cache = useQueryClient(),
    [open, setOpen] = useState(false),
    [name, setName] = useState(''),
    [password, setPassword] = useState(''),
    [generate, setGenerate] = useState(true);
  const query = useQuery({
    queryKey: ['secrets'],
    queryFn: async () => (await http.get<SecretSummary[]>('/secrets')).data,
  });
  const create = useMutation({
    mutationFn: async () =>
      (
        await http.post<SecretSummary>('/secrets', {
          name,
          ...(!generate ? { value: password } : {}),
        })
      ).data,
    onSuccess: async (secret) => {
      await cache.invalidateQueries({ queryKey: ['secrets'] });
      onChange(secret.id);
      setOpen(false);
      setName('');
      setPassword('');
    },
  });
  return (
    <>
      <div className="flex gap-2">
        <Select
          aria-label={label}
          className="min-w-0 flex-1"
          placeholder="选择已保存凭据"
          loading={query.isPending}
          value={value || null}
          options={
            query.data?.map((secret) => ({
              value: secret.id,
              label: secret.name,
            })) ?? []
          }
          onChange={onChange}
        />
        <Button
          onClick={() => {
            create.reset();
            setOpen(true);
          }}
        >
          新建凭据
        </Button>
      </div>
      {query.error && (
        <span className="text-red-600">{query.error.message}</span>
      )}
      <Modal
        open={open}
        title="新建本机凭据"
        onCancel={() => {
          setOpen(false);
          setPassword('');
        }}
        okText="保存凭据"
        onOk={() => create.mutate()}
        confirmLoading={create.isPending}
        okButtonProps={{
          disabled: !name.trim() || (!generate && password.length < 16),
        }}
        destroyOnHidden
      >
        <p>任务只保存引用。凭据在本机加密保存，不会通过列表接口返回原文。</p>
        {create.error && <Alert type="error" title={create.error.message} />}
        <Form layout="vertical">
          <Form.Item label="凭据名称">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Form.Item>
          <Form.Item label="自动生成随机凭据">
            <Switch checked={generate} onChange={setGenerate} />
          </Form.Item>
          {!generate && (
            <Form.Item label="凭据内容（至少 16 个字符）">
              <Input.Password
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </>
  );
};
