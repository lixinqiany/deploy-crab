import {
  isExecutionFinished,
  type ExecutionStatus,
  type HookExecution,
  type ExecutionError,
} from '@deploy-crab/contracts/execution';
import type { RunTree } from '@deploy-crab/contracts/session';
import { TASK_HOOK_LABELS } from '@deploy-crab/contracts/task';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Checkbox, Skeleton, Tag } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { sessionsApi } from '@/api/sessions';
import { runsApi } from '@/api/runs';

const statusLabels: Record<ExecutionStatus, string> = {
  queued: '排队中',
  running: '执行中',
  succeeded: '成功',
  failed: '失败',
  blocked: '前置失败',
  cancelled: '已取消',
  interrupted: '已中断',
  skipped: '已跳过',
};
const errorMessages = (errors: ExecutionError[]) => [
  ...new Set(errors.map((error) => error.message)),
];
export const RunStatus = ({ status }: { status: ExecutionStatus }) => (
  <Tag
    color={
      status === 'succeeded'
        ? 'success'
        : status === 'failed' || status === 'interrupted'
          ? 'error'
          : status === 'running'
            ? 'processing'
            : status === 'blocked'
              ? 'warning'
              : 'default'
    }
  >
    {statusLabels[status]}
  </Tag>
);

const LifecycleTree = ({ tree }: { tree: RunTree }) => {
  const { run, children } = tree;
  const child = (id?: string) => children.find((item) => item.run.id === id);
  const hooks = (items: HookExecution[]) =>
    items.map((hook) => {
      const nested = child(hook.childRunId);
      return (
        <div key={hook.id} className="ml-3 mt-1 text-xs text-sand-11">
          <RunStatus status={hook.status} />
          {TASK_HOOK_LABELS[hook.phase]} · {hook.key}
          {errorMessages(hook.errors).map((message) => (
            <p key={message} className="text-red-600">
              {message}
            </p>
          ))}
          {nested && <LifecycleTree tree={nested} />}
        </div>
      );
    });
  return (
    <div className="space-y-2">
      {hooks(run.hooks.filter((hook) => hook.phase === 'before'))}
      {run.steps.map((step) => {
        const nested = child(step.childRunId);
        return (
          <div key={step.id} className="rounded-lg border border-sand-4 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <RunStatus status={step.status} />
              <span className="text-sm">{step.title}</span>
              {step.status === 'running' && (
                <span className="text-xs text-sand-9">
                  {step.phase === 'body'
                    ? '执行主体'
                    : step.phase === 'finished'
                      ? ''
                      : TASK_HOOK_LABELS[step.phase]}
                </span>
              )}
            </div>
            {errorMessages(step.errors).map((message) => (
              <p key={message} className="my-1 break-all text-xs text-red-600">
                {message}
              </p>
            ))}
            {!!step.hooks.length && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-sand-9">
                  步骤钩子 · {step.hooks.length}
                </summary>
                {hooks(step.hooks)}
              </details>
            )}
            {nested && (
              <details
                className="mt-2"
                open={
                  !isExecutionFinished(nested.run.status) ||
                  nested.run.status !== 'succeeded'
                }
              >
                <summary className="cursor-pointer text-xs text-sand-11">
                  {nested.run.task} · v{nested.run.taskRevision}
                </summary>
                <div className="mt-2 border-l-2 border-sand-4 pl-3">
                  <LifecycleTree tree={nested} />
                </div>
              </details>
            )}
          </div>
        );
      })}
      {hooks(run.hooks.filter((hook) => hook.phase !== 'before'))}
    </div>
  );
};

const flatten = (tree: RunTree): RunTree['run'][] => [
  tree.run,
  ...tree.children.flatMap(flatten),
];
export const RunDetail = ({
  id,
  sessionId,
}: {
  id: string;
  sessionId: string;
}) => {
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ['run-tree', id],
    queryFn: () => sessionsApi.tree(id),
    refetchInterval: (query) =>
      query.state.data && isExecutionFinished(query.state.data.run.status)
        ? false
        : 750,
    retry: false,
  });
  const cancel = useMutation({
    mutationFn: () => runsApi.cancel(id),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['run-tree', id] });
      await cache.invalidateQueries({ queryKey: ['session-runs', sessionId] });
    },
  });
  const [follow, setFollow] = useState(true);
  const outputRef = useRef<HTMLPreElement>(null);
  const tree = query.data;
  const allRuns = tree ? flatten(tree) : [];
  const output = allRuns
    .flatMap((run) =>
      run.output.map((item) => ({
        ...item,
        runId: run.id,
        title: `${run.task}${item.stepId ? ` / ${run.steps.find((step) => step.id === item.stepId)?.title ?? item.stepId}` : ''}${item.hookId ? ' / 钩子' : ''}`,
      })),
    )
    .sort((a, b) => a.sequence - b.sequence);
  const outputVersion = output
    .map((item) => `${item.runId}:${item.sequence}`)
    .join(',');
  useEffect(() => {
    if (follow && outputRef.current)
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [follow, outputVersion]);
  if (!tree)
    return query.error ? (
      <Alert
        type="error"
        title={query.error.message}
        action={<Button onClick={() => void query.refetch()}>重试</Button>}
      />
    ) : (
      <Skeleton active />
    );
  return (
    <section
      aria-label="执行详情"
      className="rounded-xl border border-sand-4 bg-sand-1 p-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="mr-2 font-medium">{tree.run.task}</span>
          <RunStatus status={tree.run.status} />
          <p className="mb-0 mt-1 text-xs text-sand-9">
            {tree.run.targetName} · 任务版本 {tree.run.taskRevision} ·{' '}
            {new Date(tree.run.createdAt).toLocaleString()}
          </p>
        </div>
        {!isExecutionFinished(tree.run.status) && (
          <Button
            danger
            loading={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            取消执行
          </Button>
        )}
      </div>
      {(query.error || cancel.error) && (
        <Alert
          className="mb-3"
          type="error"
          title={(query.error ?? cancel.error)?.message}
        />
      )}
      {errorMessages(tree.run.errors).map((message) => (
        <Alert
          key={message}
          className="mb-3"
          type={tree.run.status === 'cancelled' ? 'warning' : 'error'}
          title={message}
        />
      ))}
      <LifecycleTree tree={tree} />
      <div className="mb-2 mt-5 flex items-center justify-between">
        <span className="text-sm font-medium">执行输出</span>
        <Checkbox
          checked={follow}
          onChange={(event) => setFollow(event.target.checked)}
        >
          跟随最新输出
        </Checkbox>
      </div>
      {allRuns.some((run) => run.outputTruncated) && (
        <p className="text-xs text-amber-text">
          输出较多，已保留各任务最近的输出（最多 256 Ki 字符）；较早内容已截断。
        </p>
      )}
      <pre
        ref={outputRef}
        aria-label="执行日志"
        className="m-0 max-h-96 min-h-24 overflow-auto rounded-lg bg-sand-12 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all text-sand-3"
      >
        {output.length
          ? output.map((item) => (
              <span
                key={`${item.runId}:${item.sequence}`}
                className={`block ${item.stream === 'stderr' ? 'text-orange-300' : ''}`}
              >
                <span className="text-sand-8">[{item.title}] </span>
                {item.text}
              </span>
            ))
          : '等待任务输出…'}
      </pre>
    </section>
  );
};
