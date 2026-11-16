import type {
  ExecutionOutput as Output,
  ExecutionStatus,
} from '@deploy-crab/contracts/execution';
import { isExecutionFinished } from '@deploy-crab/contracts/execution';
import { CodeOutlined } from '@ant-design/icons';
import { useEffect, useRef, useState } from 'react';
import styles from './SessionWorkspace.module.css';

export const ExecutionOutput = ({
  output,
  status,
  title,
  truncated,
  heading = '此步输出',
}: {
  output: Output[];
  status: ExecutionStatus;
  title: string;
  truncated: boolean;
  heading?: string;
}) => {
  const [follow, setFollow] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const viewport = useRef<HTMLPreElement>(null);
  const scroll = useRef({ top: 0, height: 0 });
  const latest = output.at(-1)?.sequence;
  useEffect(() => {
    if (follow && viewport.current)
      viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [follow, latest, expanded]);
  return (
    <div className={styles.terminal}>
      <div className={styles.terminalHeader}>
        <span>
          <CodeOutlined /> <span className="ml-1">{heading}</span>
        </span>
        <div>
          <button
            type="button"
            aria-pressed={follow}
            onClick={() => setFollow(!follow)}
          >
            {follow ? '跟随输出' : '已暂停跟随'}
          </button>
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? '缩小输出区' : '放大输出区'}
          </button>
        </div>
      </div>
      <pre
        ref={viewport}
        tabIndex={0}
        aria-label={`${title}的输出`}
        className={`${styles.terminalOutput} ${expanded ? styles.terminalExpanded : ''}`}
        onWheel={(event) => {
          if (event.deltaY < 0) setFollow(false);
        }}
        onScroll={(event) => {
          const el = event.currentTarget;
          if (
            scroll.current.height === el.scrollHeight &&
            el.scrollTop < scroll.current.top - 1
          )
            setFollow(false);
          scroll.current = { top: el.scrollTop, height: el.scrollHeight };
        }}
      >
        {output.length
          ? output.map((item) => (
              <span
                key={item.sequence}
                className={item.stream === 'stderr' ? styles.stderr : undefined}
              >
                {item.text}
              </span>
            ))
          : status === 'skipped'
            ? '本次已跳过，未执行。'
            : truncated
              ? '当前没有保留此步骤的输出，较早内容可能已截断。'
              : isExecutionFinished(status)
                ? '此步骤没有产生输出。'
                : '等待此步骤返回输出…'}
      </pre>
    </div>
  );
};
