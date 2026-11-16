import type { SessionRunSummary } from '@deploy-crab/contracts/session';
import type { Task } from '@deploy-crab/contracts/task';
import { SvgIcon } from '@deploy-crab/ui/icon/SvgIcon';
import {
  ArrowDownOutlined,
  ArrowRightOutlined,
  ReadOutlined,
} from '@ant-design/icons';
import { Alert, Button, Skeleton } from 'antd';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import CrabSvg from '@/assets/icon/crab.svg?react';
import { groupExecutionTurns } from './execution-feed-model';
import { RunDetail } from './RunDetail';
import styles from './SessionWorkspace.module.css';

export const SessionWelcome = ({
  tasks = [],
  onSelect,
}: {
  tasks?: Task[];
  onSelect?: (id: string) => void;
}) => (
  <div className={styles.empty}>
    <div className={styles.emptyMark}>
      <SvgIcon component={CrabSvg} size={46} />
    </div>
    <h2>这次，部署点什么？</h2>
    <p>
      {onSelect
        ? '选择一个任务，交给 Deploy Crab 执行。\n每一步的进展和输出，都会留在这里。'
        : '从侧边栏新建或选择一个会话，开始操作服务器。'}
    </p>
    {onSelect && !!tasks.length && (
      <div className={styles.suggestions}>
        {tasks.slice(0, 3).map((task) => (
          <button
            type="button"
            key={task.id}
            className={styles.suggestion}
            onClick={() => onSelect(task.id)}
          >
            <ReadOutlined />
            <span>{task.name}</span>
            <ArrowRightOutlined />
          </button>
        ))}
      </div>
    )}
  </div>
);

export const ExecutionFeed = ({
  runs,
  sessionId,
  pending,
  error,
  hasOlder,
  loadingOlder,
  loadOlder,
  refresh,
  tasks,
  onSelect,
  submitted,
}: {
  runs: SessionRunSummary[];
  sessionId: string;
  pending: boolean;
  error: Error | null;
  hasOlder: boolean;
  loadingOlder: boolean;
  loadOlder: () => Promise<unknown>;
  refresh: () => void;
  tasks: Task[];
  onSelect: (id: string) => void;
  submitted: string | null;
}) => {
  const turns = useMemo(() => groupExecutionTurns(runs), [runs]);
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const lastScroll = useRef({ top: 0, height: 0 });
  const anchor = useRef<{ height: number; top: number } | null>(null);
  const [away, setAway] = useState(false);
  const jump = () => {
    follow.current = true;
    setAway(false);
    if (viewport.current)
      viewport.current.scrollTop = viewport.current.scrollHeight;
  };
  useEffect(() => {
    follow.current = true;
    if (viewport.current)
      viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [submitted]);
  useLayoutEffect(() => {
    if (anchor.current && !loadingOlder && viewport.current) {
      viewport.current.scrollTop =
        anchor.current.top +
        viewport.current.scrollHeight -
        anchor.current.height;
      anchor.current = null;
    }
  }, [loadingOlder, turns]);
  useEffect(() => {
    if (!content.current) return;
    const observer = new ResizeObserver(() => {
      if (follow.current && !anchor.current && viewport.current)
        viewport.current.scrollTop = viewport.current.scrollHeight;
      if (!follow.current && viewport.current)
        setAway(
          viewport.current.scrollHeight -
            viewport.current.scrollTop -
            viewport.current.clientHeight >
            80,
        );
    });
    observer.observe(content.current);
    if (viewport.current) observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={viewport}
        className={styles.scrollArea}
        aria-label="会话执行记录"
        onClickCapture={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest('button[aria-expanded]')
          )
            follow.current = false;
        }}
        onWheel={(event) => {
          if (event.deltaY < 0) follow.current = false;
        }}
        onScroll={(event) => {
          if (anchor.current) return;
          const el = event.currentTarget;
          const nearBottom =
            el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          const previous = lastScroll.current;
          const movedUp =
            el.scrollHeight === previous.height &&
            el.scrollTop < previous.top - 1;
          if (nearBottom) follow.current = true;
          else if (movedUp) follow.current = false;
          setAway(!nearBottom && !follow.current);
          lastScroll.current = { top: el.scrollTop, height: el.scrollHeight };
        }}
      >
        <div
          ref={content}
          className={
            turns.length || pending || error ? styles.transcript : 'h-full'
          }
        >
          {error && (
            <Alert
              className="mb-5"
              type="error"
              title={error.message}
              action={<Button onClick={refresh}>重试</Button>}
            />
          )}
          {pending && <Skeleton active paragraph={{ rows: 5 }} />}
          {!pending && !error && !turns.length && (
            <SessionWelcome tasks={tasks} onSelect={onSelect} />
          )}
          {hasOlder && (
            <div className="mb-8 text-center">
              <Button
                type="text"
                size="small"
                loading={loadingOlder}
                onClick={() => {
                  if (viewport.current)
                    anchor.current = {
                      height: viewport.current.scrollHeight,
                      top: viewport.current.scrollTop,
                    };
                  follow.current = false;
                  void loadOlder();
                }}
              >
                加载更早记录
              </Button>
            </div>
          )}
          {turns.map((turn) => (
            <article
              key={turn.id}
              className={styles.turn}
              aria-label={`操作 ${turn.task}`}
            >
              <div className={styles.userRow}>
                <div className={styles.userBubble}>
                  <div className={styles.userTitle}>
                    <ReadOutlined />
                    <span>执行 {turn.task}</span>
                  </div>
                  <div className={styles.userMeta}>
                    {turn.runs[0]?.targetScope && (
                      <div>
                        {turn.runs[0].targetScope.label} ·{' '}
                        {turn.runs[0].targetScope.hostIds.length} 台主机
                      </div>
                    )}
                    {turn.runs
                      .map((run) => run.targetName ?? '目标主机')
                      .join('、')}
                  </div>
                  <time className={styles.userTime} dateTime={turn.createdAt}>
                    {new Date(turn.createdAt).toLocaleString('zh-CN', {
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
              </div>
              <div className={styles.agentHeading}>
                <span className={styles.avatar}>
                  <SvgIcon component={CrabSvg} size={21} />
                </span>
                <span>Deploy Crab</span>
                <span className={styles.agentLabel}>执行记录</span>
              </div>
              <div className={styles.agentBody}>
                {turn.runs.map((run, index) => (
                  <RunDetail
                    key={run.id}
                    summary={run}
                    sessionId={sessionId}
                    initiallyOpen={turn.id === turns.at(-1)?.id && index === 0}
                  />
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
      {away && (
        <Button
          className={styles.jumpButton ?? ''}
          style={{ top: 'auto', bottom: 12 }}
          icon={<ArrowDownOutlined />}
          onClick={jump}
        >
          回到最新
        </Button>
      )}
    </div>
  );
};
