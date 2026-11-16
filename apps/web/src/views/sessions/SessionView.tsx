import type {
  ExecuteSessionTask,
  Session,
  SessionDraft,
} from '@deploy-crab/contracts/session';
import type { Task } from '@deploy-crab/contracts/task';
import { configureTask } from '@deploy-crab/contracts/task-configuration';
import { isExecutionFinished } from '@deploy-crab/contracts/execution';
import { Page } from '@deploy-crab/ui/layout/page/Page';
import {
  DeleteOutlined,
  EditOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Skeleton,
} from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useBeforeUnload,
  useBlocker,
  useNavigate,
  useParams,
} from 'react-router';
import { sessionsApi } from '@/api/sessions';
import { tasksApi } from '@/api/tasks';
import { ApiRequestError } from '@/api/http';
import { useHosts } from '../inventory/useInventory';
import { TaskReferenceSelect } from '../tasks/TaskReferenceSelect';
import { resolveSessionFields } from './session-input-model';
import {
  SessionParameterFields,
  SessionStepChoices,
} from './SessionConfiguration';
import { RunDetail, RunStatus } from './RunDetail';

const SessionWorkspace = ({
  initial,
  tasks,
}: {
  initial: Session;
  tasks: Task[];
}) => {
  const { message, modal } = App.useApp();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const hosts = useHosts();
  const [session, setSession] = useState(initial);
  const [draft, setDraft] = useState<SessionDraft>(() =>
    structuredClone(initial.draft),
  );
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [rename, setRename] = useState(false);
  const [title, setTitle] = useState(initial.title);
  const attempt = useRef<{
    fingerprint: string;
    request: ExecuteSessionTask;
  } | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(session.draft);
  const blocker = useBlocker(dirty);
  useBeforeUnload(
    useCallback(
      (event) => {
        if (dirty) event.preventDefault();
      },
      [dirty],
    ),
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    const dialog = modal.confirm({
      title: '离开前保存配置？',
      content: '还有未保存的参数或步骤选择。正在执行的任务会继续运行。',
      okText: '放弃修改并离开',
      cancelText: '继续编辑',
      onOk: () => blocker.proceed(),
      onCancel: () => blocker.reset(),
    });
    return () => dialog.destroy();
  }, [blocker, modal]);
  const changed = (patch: Partial<SessionDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const task = tasks.find((task) => task.id === draft.taskId);
  const configuration = useMemo(() => {
    if (!task) return { value: null, error: '' };
    try {
      return {
        value: configureTask(task, tasks, draft.skippedSteps),
        error: '',
      };
    } catch (error) {
      return {
        value: null,
        error: error instanceof Error ? error.message : '配置无效',
      };
    }
  }, [task, tasks, draft.skippedSteps]);
  const resolved = configuration.value
    ? resolveSessionFields(configuration.value.configured, draft.fields)
    : { input: {}, errors: {} };
  const history = useInfiniteQuery({
    queryKey: ['session-runs', session.id],
    queryFn: ({ pageParam }) => sessionsApi.history(session.id, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) =>
        page.items.some((run) => !isExecutionFinished(run.status)),
      )
        ? 1500
        : false,
  });
  const runs = history.data?.pages.flatMap((page) => page.items) ?? [];
  const viewingRun = selectedRun ?? runs[0]?.id;
  const updateSession = (next: Session) => {
    setSession(next);
    cache.setQueryData(['session', next.id], next);
    void cache.invalidateQueries({ queryKey: ['sessions'] });
  };
  const saveDraft = async () => {
    if (!dirty) return session;
    const next = await sessionsApi.update(session.id, {
      draft,
      revision: session.revision,
    });
    updateSession(next);
    return next;
  };
  const save = useMutation({
    mutationFn: saveDraft,
    onSuccess: () => message.success('会话配置已保存'),
  });
  const execute = useMutation({
    mutationFn: async () => {
      if (!configuration.value || !task) throw new Error('请选择可用任务');
      if (!draft.hostIds.length) throw new Error('请选择至少一台主机');
      if (Object.keys(resolved.errors).length)
        throw new Error('请检查本次执行参数');
      await saveDraft();
      const body = {
        taskId: task.id,
        taskRevisions: configuration.value.revisions,
        hostIds: draft.hostIds,
        input: resolved.input,
        skippedSteps: draft.skippedSteps,
        dependsOn: draft.dependsOn,
      };
      const fingerprint = JSON.stringify(body);
      if (attempt.current?.fingerprint !== fingerprint)
        attempt.current = {
          fingerprint,
          request: { ...body, requestId: crypto.randomUUID() },
        };
      return sessionsApi.execute(session.id, attempt.current.request);
    },
    onSuccess: async (created) => {
      attempt.current = null;
      setSelectedRun(created[0]?.id ?? null);
      await cache.invalidateQueries({ queryKey: ['session-runs', session.id] });
      await cache.invalidateQueries({ queryKey: ['sessions'] });
      message.success(`已提交 ${created.length} 台主机的任务`);
    },
  });
  const renameMutation = useMutation({
    mutationFn: () =>
      sessionsApi.update(session.id, {
        title: title.trim(),
        revision: session.revision,
      }),
    onSuccess: (next) => {
      updateSession(next);
      setRename(false);
    },
  });
  const remove = useMutation({
    mutationFn: () => sessionsApi.delete(session.id),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['sessions'] });
      void navigate('/sessions');
    },
    onError: (error) => message.error(error.message),
  });
  const busy = save.isPending || execute.isPending || renameMutation.isPending;
  const error = save.error ?? execute.error;
  return (
    <Page title={session.title}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-sm text-sand-11">
          选择主机和任务，按这次操作调整参数与步骤。
        </p>
        <div className="flex gap-2">
          <Button
            icon={<EditOutlined />}
            onClick={() => {
              setTitle(session.title);
              renameMutation.reset();
              setRename(true);
            }}
          >
            重命名
          </Button>
          <Button
            danger
            icon={<DeleteOutlined />}
            aria-label="删除会话"
            disabled={
              dirty ||
              busy ||
              runs.some((run) => !isExecutionFinished(run.status))
            }
            onClick={() => {
              modal.confirm({
                title: '删除此会话及执行记录？',
                content: '任务库定义和服务器上的修改不会被删除或撤销。',
                okText: '删除会话',
                cancelText: '取消',
                okButtonProps: { danger: true },
                onOk: () => remove.mutateAsync(),
              });
            }}
          />
        </div>
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(360px,0.9fr)_minmax(440px,1.1fr)]">
        <section
          aria-label="任务执行配置"
          className="rounded-xl border border-sand-4 bg-sand-1 p-4"
        >
          <Form layout="vertical" disabled={busy}>
            <Form.Item
              label="目标主机"
              required
              extra="每台主机独立执行；未指定前置执行时可以并发。"
            >
              <Select
                mode="multiple"
                aria-label="执行主机"
                placeholder="选择一台或多台主机"
                value={draft.hostIds}
                loading={hosts.isPending}
                showSearch={{ optionFilterProp: 'label' }}
                options={(hosts.data ?? []).map((host) => ({
                  value: host.id,
                  label: `${host.name} · ${host.user}@${host.publicAddress ?? host.privateAddress}`,
                }))}
                onChange={(hostIds: string[]) => changed({ hostIds })}
              />
            </Form.Item>
            {hosts.error && (
              <Alert
                type="error"
                className="mb-3"
                title={hosts.error.message}
                action={
                  <Button onClick={() => void hosts.refetch()}>重试</Button>
                }
              />
            )}
            <Form.Item label="执行任务" required>
              <TaskReferenceSelect
                ariaLabel="选择执行任务"
                tasks={tasks}
                value={draft.taskId ?? ''}
                onChange={(taskId) => {
                  if (taskId !== draft.taskId) {
                    changed({ taskId, fields: {}, skippedSteps: [] });
                    execute.reset();
                  }
                }}
              />
            </Form.Item>
            {draft.taskId && !task && (
              <Alert
                className="mb-3"
                type="warning"
                title="原任务已删除，请重新选择"
              />
            )}
            {task?.description && (
              <details className="mb-4 text-xs leading-5 text-sand-9">
                <summary className="cursor-pointer">任务说明与执行前提</summary>
                <p>{task.description}</p>
              </details>
            )}
            {configuration.error && (
              <Alert
                className="mb-3"
                type="error"
                title={configuration.error}
                action={
                  <Button onClick={() => changed({ skippedSteps: [] })}>
                    重置跳过选择
                  </Button>
                }
              />
            )}
            {configuration.value && (
              <>
                <div className="mb-4">
                  <SessionParameterFields
                    usage={configuration.value.configured.usage}
                    fields={draft.fields}
                    errors={resolved.errors}
                    onChange={(fields) => changed({ fields })}
                  />
                </div>
                <div className="mb-3 text-sm font-medium">
                  本次步骤{' '}
                  <span className="ml-1 text-xs font-normal text-sand-9">
                    跳过不会修改任务定义
                  </span>
                </div>
                <SessionStepChoices
                  configuration={configuration.value.configured}
                  disabled={busy}
                  skipped={draft.skippedSteps}
                  onChange={(skippedSteps) => changed({ skippedSteps })}
                />
              </>
            )}
            <Form.Item
              className="mt-4"
              label="前置执行（可选）"
              extra="选择后等待这些执行全部成功；前置失败会阻止本次执行。同一主机的关联操作可在这里安排先后。"
            >
              <Select
                mode="multiple"
                aria-label="前置执行"
                value={draft.dependsOn}
                allowClear
                showSearch={{ optionFilterProp: 'label' }}
                placeholder="不选择则独立执行"
                options={runs.map((run) => ({
                  value: run.id,
                  label: `${run.task} · ${run.targetName ?? ''} · ${new Date(run.createdAt).toLocaleTimeString()}`,
                }))}
                onChange={(dependsOn: string[]) => changed({ dependsOn })}
              />
            </Form.Item>
            {error && (
              <Alert
                className="mb-3"
                type="error"
                title={error.message}
                description={
                  error instanceof ApiRequestError && error.issues.length
                    ? error.issues.map((issue) => issue.message).join('；')
                    : undefined
                }
              />
            )}
            <div className="flex flex-wrap items-center gap-2 border-t border-sand-4 pt-4">
              <Button
                icon={<SaveOutlined />}
                loading={save.isPending}
                disabled={!dirty || execute.isPending}
                onClick={() => save.mutate()}
              >
                保存配置
              </Button>
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                loading={execute.isPending}
                disabled={
                  save.isPending ||
                  !task ||
                  !draft.hostIds.length ||
                  !configuration.value ||
                  !!Object.keys(resolved.errors).length ||
                  !!hosts.error
                }
                onClick={() => execute.mutate()}
              >
                执行任务
                {draft.hostIds.length > 1
                  ? ` · ${draft.hostIds.length} 台`
                  : ''}
              </Button>
              <Button
                type="text"
                icon={<ReloadOutlined />}
                aria-label="刷新任务定义"
                onClick={() =>
                  void cache.invalidateQueries({ queryKey: ['tasks'] })
                }
              />
            </div>
            <p className="mb-0 text-xs text-sand-9">
              {dirty ? '配置有未保存修改；执行时会先保存。' : '配置已保存。'}
              执行中关闭页面不会停止任务。
            </p>
          </Form>
        </section>
        <div className="flex flex-col gap-4 xl:sticky xl:top-5">
          <section
            aria-label="会话执行记录"
            className="rounded-xl border border-sand-4 bg-sand-1 p-4"
          >
            <div className="mb-3 flex items-center justify-between text-sm font-medium">
              执行记录
              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined />}
                aria-label="刷新执行记录"
                onClick={() => void history.refetch()}
              />
            </div>
            {history.error && (
              <Alert
                type="error"
                title={history.error.message}
                action={
                  <Button onClick={() => void history.refetch()}>重试</Button>
                }
              />
            )}
            {!runs.length && !history.isPending && (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="选择主机和任务，开始第一次执行"
              />
            )}
            <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
              {runs.map((run) => (
                <button
                  type="button"
                  key={run.id}
                  aria-label={`查看执行 ${run.task} ${run.targetName ?? ''}`}
                  aria-pressed={viewingRun === run.id}
                  onClick={() => setSelectedRun(run.id)}
                  className={`rounded-lg border p-3 text-left ${viewingRun === run.id ? 'border-amber-line bg-amber-soft' : 'border-sand-4 hover:bg-sand-2'}`}
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium">{run.task}</span>
                    <RunStatus status={run.status} />
                  </span>
                  <span className="text-xs text-sand-9">
                    {run.targetName} ·{' '}
                    {new Date(run.createdAt).toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
            {history.hasNextPage && (
              <Button
                className="mt-3"
                block
                loading={history.isFetchingNextPage}
                onClick={() => void history.fetchNextPage()}
              >
                加载更早记录
              </Button>
            )}
          </section>
          {viewingRun && (
            <RunDetail
              key={viewingRun}
              id={viewingRun}
              sessionId={session.id}
            />
          )}
        </div>
      </div>
      <Modal
        title="重命名会话"
        open={rename}
        onCancel={() => setRename(false)}
        onOk={() => renameMutation.mutate()}
        confirmLoading={renameMutation.isPending}
        okButtonProps={{ disabled: !title.trim() }}
        okText="保存"
        cancelText="取消"
      >
        <Input
          aria-label="会话新标题"
          maxLength={64}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        {renameMutation.error && (
          <Alert
            className="mt-3"
            type="error"
            title={renameMutation.error.message}
          />
        )}
      </Modal>
    </Page>
  );
};

export const SessionView = () => {
  const { id } = useParams();
  const session = useQuery({
    queryKey: ['session', id],
    queryFn: () => sessionsApi.get(id!),
    enabled: !!id,
    refetchOnWindowFocus: false,
  });
  const tasks = useQuery({ queryKey: ['tasks'], queryFn: tasksApi.list });
  if (!id)
    return (
      <Page title="会话">
        <Empty description="从侧边栏新建或选择一个会话，开始操作服务器。" />
      </Page>
    );
  if (session.error || tasks.error)
    return (
      <Page title="会话">
        <Alert
          type="error"
          title={(session.error ?? tasks.error)?.message}
          action={
            <Button
              onClick={() => {
                void session.refetch();
                void tasks.refetch();
              }}
            >
              重试
            </Button>
          }
        />
      </Page>
    );
  if (!session.data || !tasks.data)
    return (
      <Page title="会话">
        <Skeleton active paragraph={{ rows: 8 }} />
      </Page>
    );
  return (
    <SessionWorkspace
      key={session.data.id}
      initial={session.data}
      tasks={tasks.data}
    />
  );
};
