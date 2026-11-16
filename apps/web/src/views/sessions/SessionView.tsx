import type {
  ExecuteSessionTask,
  Session,
} from '@deploy-crab/contracts/session';
import { SessionDraft } from '@deploy-crab/contracts/session';
import type { Task } from '@deploy-crab/contracts/task';
import { configureTask } from '@deploy-crab/contracts/task-configuration';
import { isExecutionFinished } from '@deploy-crab/contracts/execution';
import { Page } from '@deploy-crab/ui/layout/page/Page';
import {
  ArrowUpOutlined,
  DeleteOutlined,
  EditOutlined,
  MoreOutlined,
  ReadOutlined,
  ReloadOutlined,
  SaveOutlined,
  SettingOutlined,
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
  Drawer,
  Dropdown,
  Tooltip,
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
import { useHosts, useClusters } from '../inventory/useInventory';
import type { TargetSelection } from '@deploy-crab/contracts/execution-target';
import { ExecutionTargetSelect } from './ExecutionTargetSelect';
import { TaskReferenceSelect } from '../tasks/TaskReferenceSelect';
import { resolveSessionFields } from './session-input-model';
import {
  SessionParameterFields,
  SessionStepChoices,
} from './SessionConfiguration';
import { ExecutionFeed, SessionWelcome } from './ExecutionFeed';
import { RunStatus } from './RunDetail';
import styles from './SessionWorkspace.module.css';
import { previewTarget } from './session-target-model';
import { draftFingerprint } from './session-draft-model';

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
  const clusters = useClusters();
  const [session, setSession] = useState(initial);
  const [draft, setDraft] = useState<SessionDraft>(() =>
    structuredClone(initial.draft),
  );
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [configure, setConfigure] = useState(false);
  const [draftNotice, setDraftNotice] = useState('');
  const [rename, setRename] = useState(false);
  const [title, setTitle] = useState(initial.title);
  const attempt = useRef<{
    fingerprint: string;
    request: ExecuteSessionTask;
  } | null>(null);
  const dirty = draftFingerprint(draft) !== draftFingerprint(session.draft);
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
  const targetSelection: TargetSelection | undefined =
    draft.targetSelection ??
    (draft.hostIds.length
      ? { kind: 'hosts', hostIds: draft.hostIds }
      : undefined);
  const targetLoading = hosts.isFetching || clusters.isFetching;
  const targetPreview = previewTarget(
    targetSelection,
    clusters.data ?? [],
    hosts.data ?? [],
  );
  const targetChanged =
    !!targetPreview.value &&
    (targetPreview.value.hostIds.length !== draft.hostIds.length ||
      targetPreview.value.hostIds.some((id) => !draft.hostIds.includes(id)));
  const targetError =
    hosts.error?.message ??
    (targetSelection?.kind === 'cluster'
      ? clusters.error?.message
      : undefined) ??
    (targetChanged
      ? '目标成员已变化，请重新选择执行目标，核对主机名单'
      : targetPreview.error);
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
    onSuccess: () => {
      setDraftNotice('');
      message.success('会话配置已保存');
    },
  });
  const execute = useMutation({
    mutationFn: async () => {
      if (!configuration.value || !task) throw new Error('请选择可用任务');
      if (!targetPreview.value || targetError)
        throw new Error(targetError || '请选择执行目标');
      if (Object.keys(resolved.errors).length)
        throw new Error('请检查本次执行参数');
      const saved = await saveDraft();
      const body = {
        taskId: task.id,
        taskRevisions: configuration.value.revisions,
        hostIds: draft.hostIds,
        ...(targetSelection ? { targetSelection } : {}),
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
      const created = await sessionsApi.execute(
        session.id,
        attempt.current.request,
      );
      return { created, draftRevision: saved.revision };
    },
    onSuccess: async ({ created, draftRevision }) => {
      attempt.current = null;
      // 草稿在提交被接受时消费，完成事件不能清掉用户接着准备的新操作。
      const empty = SessionDraft.parse({});
      setDraft(empty);
      setDraftNotice('');
      setConfigure(false);
      setSubmitted(created[0]?.requestId ?? created[0]?.id ?? null);
      try {
        updateSession(
          await sessionsApi.update(session.id, {
            draft: empty,
            revision: draftRevision,
          }),
        );
      } catch (error) {
        // 执行已成功提交，清空草稿的失败不能变成“提交失败”诱发重复执行。
        setDraftNotice(
          `任务已提交，但空白草稿未保存：${error instanceof Error ? error.message : '请稍后保存配置'}`,
        );
      }
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
  const activeRuns = runs.filter((run) => !isExecutionFinished(run.status));
  const parameterErrors = Object.keys(resolved.errors).length;
  const selectTask = (taskId: string) => {
    if (busy || taskId === draft.taskId) return;
    changed({ taskId, fields: {}, skippedSteps: [] });
    execute.reset();
  };
  const hint = !task
    ? '选择任务和执行目标，开始下一次操作'
    : !draft.hostIds.length
      ? '选择集群、分组或单独主机，准备开始'
      : targetError
        ? targetError
        : parameterErrors
          ? `${parameterErrors} 项参数需要检查`
          : draft.dependsOn.length
            ? `等待 ${draft.dependsOn.length} 项前置执行成功后开始`
            : draft.hostIds.length > 1
              ? `将在 ${draft.hostIds.length} 台主机上分别执行`
              : '准备就绪，可以执行';
  return (
    <div className={styles.workspace}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1>{session.title}</h1>
          <p>会话 · 服务器操作空间</p>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.connection} role="status">
            {activeRuns.length ? (
              <>
                <RunStatus
                  status={
                    activeRuns.some((run) => run.status === 'running')
                      ? 'running'
                      : 'queued'
                  }
                />
                <span>· {activeRuns.length} 项</span>
              </>
            ) : (
              <>
                <span className={styles.connectionDot} />
                待命
              </>
            )}
          </div>
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                {
                  key: 'rename',
                  label: '重命名会话',
                  icon: <EditOutlined />,
                  disabled: busy,
                },
                {
                  key: 'refresh',
                  label: '刷新执行记录',
                  icon: <ReloadOutlined />,
                },
                { type: 'divider' },
                {
                  key: 'delete',
                  label: '删除会话',
                  icon: <DeleteOutlined />,
                  danger: true,
                  disabled:
                    dirty || busy || remove.isPending || !!activeRuns.length,
                },
              ],
              onClick: ({ key }) => {
                if (key === 'rename') {
                  setTitle(session.title);
                  renameMutation.reset();
                  setRename(true);
                }
                if (key === 'refresh') {
                  void history.refetch();
                  void cache.invalidateQueries({ queryKey: ['run-tree'] });
                }
                if (key === 'delete') {
                  modal.confirm({
                    title: '删除此会话及执行记录？',
                    content: '任务库定义和服务器上的修改不会被删除或撤销。',
                    okText: '删除会话',
                    cancelText: '取消',
                    okButtonProps: { danger: true },
                    onOk: () => remove.mutateAsync(),
                  });
                }
              },
            }}
          >
            <Button type="text" icon={<MoreOutlined />} aria-label="会话菜单" />
          </Dropdown>
        </div>
      </header>
      <ExecutionFeed
        runs={runs}
        sessionId={session.id}
        pending={history.isPending}
        error={history.error}
        hasOlder={history.hasNextPage}
        loadingOlder={history.isFetchingNextPage}
        loadOlder={() => history.fetchNextPage()}
        refresh={() => void history.refetch()}
        tasks={tasks}
        onSelect={selectTask}
        submitted={submitted}
      />
      <div className={styles.composerDock}>
        <section aria-label="任务执行配置" className={styles.composer}>
          <div className={styles.taskLine}>
            <span className={styles.taskSymbol}>
              <ReadOutlined />
            </span>
            <div className={styles.taskSelect}>
              <TaskReferenceSelect
                ariaLabel="选择执行任务"
                tasks={tasks}
                value={draft.taskId ?? ''}
                onChange={selectTask}
                disabled={busy}
              />
            </div>
            <Tooltip title="刷新任务定义">
              <Button
                type="text"
                size="small"
                disabled={busy}
                icon={<ReloadOutlined />}
                aria-label="刷新任务定义"
                onClick={() =>
                  void cache.invalidateQueries({ queryKey: ['tasks'] })
                }
              />
            </Tooltip>
          </div>
          <p className={styles.taskDescription}>
            {task
              ? `${task.definition.steps.length} 个步骤${draft.skippedSteps.length ? ` · 已选择跳过 ${draft.skippedSteps.length} 步` : ''}${task.description ? ` · ${task.description}` : ''}`
              : '从任务库选择能力，组合成这一次操作。'}
          </p>
          {draft.taskId && !task && (
            <Alert type="warning" title="原任务已删除，请重新选择" />
          )}
          {configuration.error && (
            <Alert
              type="error"
              title={configuration.error}
              action={
                <Button
                  size="small"
                  onClick={() => changed({ skippedSteps: [] })}
                >
                  重置跳过选择
                </Button>
              }
            />
          )}
          {error && (
            <Alert
              className="mt-2"
              type="error"
              title={error.message}
              description={
                error instanceof ApiRequestError && error.issues.length
                  ? error.issues.map((issue) => issue.message).join('；')
                  : undefined
              }
            />
          )}
          {targetError && !targetLoading && (
            <Alert className="mt-2" type="warning" title={targetError} />
          )}
          {draftNotice && (
            <Alert className="mt-2" type="warning" title={draftNotice} />
          )}
          <div className={styles.composerToolbar}>
            <ExecutionTargetSelect
              value={targetSelection}
              preview={targetPreview.value}
              clusters={clusters.data ?? []}
              hosts={hosts.data ?? []}
              loading={targetLoading}
              error={hosts.error?.message ?? clusters.error?.message ?? ''}
              disabled={busy}
              refresh={() => {
                void hosts.refetch();
                void clusters.refetch();
              }}
              onChange={(targetSelection) => {
                const next = previewTarget(
                  targetSelection,
                  clusters.data ?? [],
                  hosts.data ?? [],
                );
                changed({
                  targetSelection,
                  hostIds: next.value?.hostIds ?? [],
                });
                execute.reset();
              }}
            />
            <Button
              type="text"
              className={styles.toolButton ?? ''}
              icon={<SettingOutlined />}
              disabled={!task || busy}
              onClick={() => setConfigure(true)}
            >
              {parameterErrors
                ? `参数待完善 · ${parameterErrors}`
                : '参数与步骤'}
            </Button>
            <span className={styles.toolbarSpacer} />
            <Tooltip title={dirty ? '保存本次配置' : '配置已保存'}>
              <Button
                type="text"
                icon={<SaveOutlined />}
                aria-label="保存配置"
                loading={save.isPending}
                disabled={!dirty || busy}
                onClick={() => save.mutate()}
              />
            </Tooltip>
            <Tooltip title={parameterErrors ? '请先完善参数' : '执行任务'}>
              <Button
                type="primary"
                shape="circle"
                className={styles.sendButton ?? ''}
                icon={<ArrowUpOutlined />}
                aria-label="执行任务"
                loading={execute.isPending}
                disabled={
                  busy ||
                  !task ||
                  !draft.hostIds.length ||
                  !configuration.value ||
                  !!parameterErrors ||
                  !!targetError ||
                  targetLoading ||
                  !targetPreview.value
                }
                onClick={() => execute.mutate()}
              />
            </Tooltip>
          </div>
        </section>
        <div className={styles.composerHint}>
          {parameterErrors && draft.hostIds.length > 0 && !targetError ? (
            <button
              type="button"
              className={styles.hintAction}
              onClick={() => setConfigure(true)}
            >
              {hint}
            </button>
          ) : (
            <span>{hint}</span>
          )}
          <span>·</span>
          <span>{dirty ? '执行时保存配置' : '执行中离开页面不会停止任务'}</span>
        </div>
      </div>
      <Drawer
        title="本次执行配置"
        open={configure}
        onClose={() => setConfigure(false)}
        size={520}
        styles={{ wrapper: { maxWidth: '100vw' } }}
        footer={
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-sand-9">
              仅影响本次执行，不修改任务定义
            </span>
            <Button type="primary" onClick={() => setConfigure(false)}>
              完成配置
            </Button>
          </div>
        }
      >
        <h2 className={styles.drawerTask}>{task?.name}</h2>
        <p className={styles.drawerIntro}>
          {task?.description ||
            '调整参数、选择需要执行的步骤，也可以安排前置依赖。'}
        </p>
        <Form layout="vertical" disabled={busy}>
          {configuration.value && (
            <>
              <div className="mb-6">
                <SessionParameterFields
                  targets={(hosts.data ?? [])
                    .filter((host) => draft.hostIds.includes(host.id))
                    .map((host) => ({
                      id: host.id,
                      name: host.name,
                      address: host.privateAddress ?? host.publicAddress ?? '',
                    }))}
                  usage={configuration.value.configured.usage}
                  fields={draft.fields}
                  errors={resolved.errors}
                  onChange={(fields) => changed({ fields })}
                />
              </div>
              <div className="mb-3 text-sm font-medium">
                执行步骤{' '}
                <span className="ml-1 text-xs font-normal text-sand-9">
                  按需跳过可选步骤
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
            className="mt-6"
            label="前置执行（可选）"
            extra="等待所选执行全部成功后开始；前置失败会阻止本次执行。"
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
            {history.hasNextPage && (
              <Button
                type="link"
                size="small"
                loading={history.isFetchingNextPage}
                onClick={() => void history.fetchNextPage()}
              >
                加载更早的前置执行
              </Button>
            )}
          </Form.Item>
        </Form>
      </Drawer>
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
    </div>
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
      <div className={styles.workspace}>
        <SessionWelcome />
      </div>
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
