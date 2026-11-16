import {
  isExecutionFinished,
  type ExecutionStatus,
  type HookExecution,
  type ExecutionError,
} from '@deploy-crab/contracts/execution';
import type {
  RunTree,
  SessionRunSummary,
} from '@deploy-crab/contracts/session';
import { TASK_HOOK_LABELS } from '@deploy-crab/contracts/task';
import {
  CheckCircleFilled,
  CloseCircleFilled,
  LoadingOutlined,
  MinusCircleOutlined,
  ClockCircleOutlined,
  RightOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Skeleton, Tooltip } from 'antd';
import { useMemo, useState, type ReactNode } from 'react';
import { ExecutionOutput } from './ExecutionOutput';
import { indexRunOutput } from './execution-output-model';
import { sessionsApi } from '@/api/sessions';
import { runsApi } from '@/api/runs';
import { statusLabels, statusTone } from './execution-feed-model';
import styles from './SessionWorkspace.module.css';

const errorMessages = (errors: ExecutionError[]) => [
  ...new Set(errors.map((error) => error.message)),
];

export const RunStatus = ({ status }: { status: ExecutionStatus }) => (
  <span className={styles.status}>
    <span
      aria-hidden="true"
      className={`${styles.lights} ${status === 'running' ? styles.pulse : ''}`}
      data-tone={statusTone(status)}
    >
      <i className={styles.bulb} />
      <i className={styles.bulb} />
      <i className={styles.bulb} />
    </span>
    <span>{statusLabels[status]}</span>
  </span>
);

const StepMarker = ({ status }: { status: ExecutionStatus }) => (
  <span
    aria-hidden="true"
    className={styles.stepDot}
    data-tone={statusTone(status)}
  >
    {status === 'running' ? (
      <LoadingOutlined />
    ) : status === 'succeeded' ? (
      <CheckCircleFilled />
    ) : statusTone(status) === 'red' ? (
      <CloseCircleFilled />
    ) : status === 'queued' ? (
      <ClockCircleOutlined />
    ) : (
      <MinusCircleOutlined />
    )}
  </span>
);

const TimelineItem = ({
  id,
  status,
  title,
  errors,
  children,
  detailLabel = '查看输出',
}: {
  id: string;
  status: ExecutionStatus;
  title: string;
  errors: ExecutionError[];
  children: ReactNode;
  detailLabel?: string;
}) => {
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const open =
    expanded ?? (status === 'running' || statusTone(status) === 'red');
  return (
    <div className={styles.step}>
      <StepMarker status={status} />
      <button
        type="button"
        className={styles.stepToggle}
        aria-label={`${open ? '收起' : '展开'}步骤 ${title}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setExpanded(!open)}
      >
        <span className={styles.stepTitle}>{title}</span>
        <span className={styles.stepAction}>
          {open ? '收起详情' : detailLabel}
        </span>
        <span className={styles.stepState}>{statusLabels[status]}</span>
        <RightOutlined
          className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
        />
      </button>
      {open && (
        <div id={id} className={styles.stepBody}>
          {errorMessages(errors).map((message) => (
            <p key={message} className={styles.stepError}>
              {message}
            </p>
          ))}
          {children}
        </div>
      )}
    </div>
  );
};

const LifecycleTree = ({ tree }: { tree: RunTree }) => {
  const { run, children } = tree;
  const output = useMemo(() => indexRunOutput(run), [run]);
  const child = (id?: string) => children.find((item) => item.run.id === id);
  const hooks = (items: HookExecution[]) =>
    items.map((hook) => {
      const nested = child(hook.childRunId);
      const title = `${TASK_HOOK_LABELS[hook.phase]} · ${hook.title ?? hook.key}`;
      const entries = output.hooks.get(hook.id) ?? [];
      return (
        <TimelineItem
          key={hook.id}
          id={`hook-${hook.id}`}
          status={hook.status}
          title={title}
          errors={hook.errors}
          detailLabel={nested ? '查看子任务' : '查看输出'}
        >
          {(!nested || entries.length > 0) && (
            <ExecutionOutput
              output={entries}
              status={hook.status}
              title={title}
              truncated={run.outputTruncated}
              heading="钩子输出"
            />
          )}
          {nested && <LifecycleTree tree={nested} />}
        </TimelineItem>
      );
    });
  return (
    <div className={styles.timeline}>
      {hooks(run.hooks.filter((hook) => hook.phase === 'before'))}
      {run.steps.map((step) => {
        const nested = child(step.childRunId);
        const entries = output.steps.get(step.id) ?? [];
        return (
          <TimelineItem
            key={step.id}
            id={`step-${run.id}-${step.id}`}
            status={step.status}
            title={step.title}
            errors={step.errors}
            detailLabel={
              nested
                ? '查看子任务'
                : step.status === 'skipped'
                  ? '查看详情'
                  : '查看输出'
            }
          >
            {step.status === 'running' &&
              step.phase !== 'body' &&
              step.phase !== 'finished' && (
                <div className={styles.runFootnote}>
                  {TASK_HOOK_LABELS[step.phase]}
                </div>
              )}
            {step.hooks.some((hook) => hook.phase === 'before') && (
              <div className={styles.timeline}>
                {hooks(step.hooks.filter((hook) => hook.phase === 'before'))}
              </div>
            )}
            {!nested &&
              step.result !== null &&
              step.action === 'ssh.exec' &&
              typeof step.input === 'object' &&
              step.input !== null &&
              'output' in step.input &&
              step.input.output === 'json' && (
                <div className="my-3 rounded-xl border border-sand-4 bg-sand-2 p-4">
                  <div className="mb-2 text-sm font-medium">步骤结果</div>
                  <pre className="m-0 max-h-80 overflow-auto whitespace-pre-wrap break-all text-sm">
                    {JSON.stringify(step.result, null, 2)}
                  </pre>
                </div>
              )}
            {(!nested || entries.length > 0) && (
              <ExecutionOutput
                output={entries}
                status={step.status}
                title={step.title}
                truncated={run.outputTruncated}
              />
            )}
            {nested && (
              <div className={styles.nestedTask}>
                <div className={styles.nestedTaskTitle}>
                  {nested.run.task}
                  {nested.run.taskRevision
                    ? ` · v${nested.run.taskRevision}`
                    : ''}
                </div>
                <LifecycleTree tree={nested} />
              </div>
            )}
            {step.hooks.some((hook) => hook.phase !== 'before') && (
              <div className={styles.timeline}>
                {hooks(step.hooks.filter((hook) => hook.phase !== 'before'))}
              </div>
            )}
          </TimelineItem>
        );
      })}
      {hooks(run.hooks.filter((hook) => hook.phase !== 'before'))}
      {!!output.task.length && (
        <ExecutionOutput
          output={output.task}
          status={run.status}
          title={`${run.task}任务级`}
          truncated={run.outputTruncated}
          heading="任务级输出"
        />
      )}
      {run.outputTruncated && (
        <p className={styles.runFootnote}>
          此任务较早的输出已截断，各步骤显示当前保留的内容。
        </p>
      )}
    </div>
  );
};

export const RunDetail = ({
  summary,
  sessionId,
  initiallyOpen = false,
}: {
  summary: SessionRunSummary;
  sessionId: string;
  initiallyOpen?: boolean;
}) => {
  const id = summary.id;
  const cache = useQueryClient();
  const [open, setOpen] = useState(initiallyOpen);
  const query = useQuery({
    queryKey: ['run-tree', id],
    queryFn: () => sessionsApi.tree(id),
    enabled: (query) =>
      open ||
      !isExecutionFinished(summary.status) ||
      (!!query.state.data && !isExecutionFinished(query.state.data.run.status)),
    refetchInterval: (query) =>
      query.state.data && isExecutionFinished(query.state.data.run.status)
        ? false
        : 1000,
    retry: false,
  });
  const cancel = useMutation({
    mutationFn: () => runsApi.cancel(id),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['run-tree', id] });
      await cache.invalidateQueries({ queryKey: ['session-runs', sessionId] });
    },
  });
  const tree = query.data;
  const run = tree?.run ?? summary;
  const finished = isExecutionFinished(run.status);
  const completedSteps =
    tree?.run.steps.filter((step) => isExecutionFinished(step.status)).length ??
    0;
  const activeStep = tree?.run.steps.find((step) => step.status === 'running');
  const succeededSteps =
    tree?.run.steps.filter((step) => step.status === 'succeeded').length ?? 0;
  const skippedSteps =
    tree?.run.steps.filter((step) => step.status === 'skipped').length ?? 0;
  const progress =
    run.status === 'succeeded'
      ? [
          succeededSteps ? `${succeededSteps} 步完成` : '',
          skippedSteps ? `${skippedSteps} 步跳过` : '',
        ]
          .filter(Boolean)
          .join(' · ')
      : `${completedSteps} / ${tree?.run.steps.length ?? 0} 步已结束`;
  const detailId = `run-details-${id}`;
  return (
    <section
      aria-label={`执行 ${summary.targetName ?? summary.task}`}
      className={styles.run}
    >
      <div className={styles.runHeader}>
        <button
          type="button"
          className={styles.runToggle}
          aria-label={`${open ? '收起' : '展开'}执行 ${summary.targetName ?? summary.task}`}
          aria-expanded={open}
          aria-controls={detailId}
          onClick={() => setOpen(!open)}
        >
          <RightOutlined
            className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
          />
          <div className={styles.runHost}>
            <span>{run.task}</span>
            <span className={styles.runMeta}>
              {run.targetName ?? '目标主机'} ·{' '}
              {activeStep
                ? activeStep.title
                : run.status === 'queued'
                  ? run.dependsOn.length
                    ? '等待前置执行成功'
                    : '等待调度'
                  : tree
                    ? progress
                    : `任务版本 ${run.taskRevision ?? '—'}`}
            </span>
          </div>
          <RunStatus status={run.status} />
        </button>
        {!finished && (
          <Tooltip title="停止此主机的执行">
            <Button
              type="text"
              size="small"
              danger
              aria-label={`停止执行 ${run.targetName ?? run.task}`}
              icon={<StopOutlined />}
              loading={cancel.isPending}
              onClick={() => cancel.mutate()}
            />
          </Tooltip>
        )}
      </div>
      {cancel.error && !open && (
        <Alert type="error" title={cancel.error.message} />
      )}
      {open && (
        <div className={styles.runContent} id={detailId}>
          {(query.error || cancel.error) && (
            <Alert
              className="mt-3"
              type="error"
              title={(query.error ?? cancel.error)?.message}
              action={
                query.error ? (
                  <Button size="small" onClick={() => void query.refetch()}>
                    重试
                  </Button>
                ) : undefined
              }
            />
          )}
          {!tree && !query.error ? (
            <Skeleton
              active
              paragraph={{ rows: 2 }}
              title={false}
              className="mt-4"
            />
          ) : (
            <>
              {errorMessages(run.errors)
                .filter(
                  (message) =>
                    !tree?.run.steps.some((step) =>
                      step.errors.some((error) =>
                        message.includes(error.message),
                      ),
                    ),
                )
                .map((message) => (
                  <p key={message} className={styles.runNotice}>
                    {message}
                  </p>
                ))}
              {run.status === 'queued' && (
                <p className={styles.runInfo}>
                  {run.dependsOn.length
                    ? '前置执行全部成功后，将自动开始。'
                    : '任务已提交，等待执行。'}
                </p>
              )}
              {run.targetScope && (
                <p className={styles.runInfo}>
                  执行范围：{run.targetScope.label}
                </p>
              )}
              {tree && <LifecycleTree tree={tree} />}
              <div className={styles.runFootnote}>
                任务 v{run.taskRevision ?? '—'} ·{' '}
                {new Date(run.createdAt).toLocaleString()}
                {run.finishedAt
                  ? ` · 结束于 ${new Date(run.finishedAt).toLocaleTimeString()}`
                  : ''}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
};
