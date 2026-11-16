import { CommentOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Input, Modal, Tooltip } from 'antd';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { sessionsApi } from '@/api/sessions';

export const SessionSidebar = ({ collapsed }: { collapsed: boolean }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const cache = useQueryClient();
  const query = useQuery({ queryKey: ['sessions'], queryFn: sessionsApi.list });
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const create = useMutation({
    mutationFn: () => sessionsApi.create({ title: title.trim() }),
    onSuccess: async (session) => {
      cache.setQueryData(['session', session.id], session);
      await cache.invalidateQueries({ queryKey: ['sessions'] });
      setOpen(false);
      setTitle('');
      void navigate(`/sessions/${session.id}`);
    },
  });
  const start = () => {
    setTitle('');
    create.reset();
    setOpen(true);
  };
  return (
    <>
      <section aria-label="会话列表" className="flex h-full min-h-0 flex-col">
        {collapsed ? (
          <Tooltip title="新建会话" placement="right">
            <Button
              type="text"
              className="mx-auto"
              aria-label="新建会话"
              icon={<PlusOutlined />}
              onClick={start}
            />
          </Tooltip>
        ) : (
          <>
            <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-3">
              <span className="text-xs font-medium text-sand-9">会话</span>
              <Button
                type="text"
                size="small"
                aria-label="新建会话"
                icon={<PlusOutlined />}
                onClick={start}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
              {query.error && (
                <Alert
                  type="error"
                  title="会话加载失败"
                  action={
                    <Button size="small" onClick={() => void query.refetch()}>
                      重试
                    </Button>
                  }
                />
              )}
              {(query.data ?? []).map((session) => (
                <button
                  key={session.id}
                  type="button"
                  aria-label={`打开会话 ${session.title}`}
                  aria-current={
                    pathname === `/sessions/${session.id}` ? 'page' : undefined
                  }
                  onClick={() => void navigate(`/sessions/${session.id}`)}
                  className={`mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm ${pathname === `/sessions/${session.id}` ? 'bg-amber-soft text-amber-text' : 'text-sand-11 hover:bg-sand-3'}`}
                >
                  <CommentOutlined />
                  <span
                    className="min-w-0 flex-1 truncate"
                    title={session.title}
                  >
                    {session.title}
                  </span>
                </button>
              ))}
              {!query.isPending && !query.error && !query.data?.length && (
                <p className="px-3 text-xs leading-6 text-sand-9">
                  新建会话，选择主机并执行任务。
                </p>
              )}
            </div>
          </>
        )}
      </section>
      <Modal
        title="新建会话"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => create.mutate()}
        okText="创建会话"
        cancelText="取消"
        confirmLoading={create.isPending}
        okButtonProps={{ disabled: !title.trim() }}
        destroyOnHidden
      >
        <p className="text-sm text-sand-11">
          为这次操作取一个名字，方便之后查找。
        </p>
        <Input
          aria-label="会话标题"
          autoFocus
          maxLength={64}
          placeholder="例如 生产环境 Docker 部署"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onPressEnter={() => {
            if (title.trim() && !create.isPending) create.mutate();
          }}
        />
        {create.error && (
          <Alert className="mt-3" type="error" title={create.error.message} />
        )}
      </Modal>
    </>
  );
};
