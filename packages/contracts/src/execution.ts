import type { TaskInput } from './task-input';

/** 执行对象与持久化无关；首版运行记录仅在 server 内存中短期保留。 */
export type ExecutionStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'blocked'
  | 'cancelled'
  | 'interrupted'
  | 'skipped';

export const isExecutionFinished = (status: ExecutionStatus): boolean =>
  status !== 'queued' && status !== 'running';

export type HookPhase = 'before' | 'afterSuccess' | 'finally';
export type ExecutionPhase = HookPhase | 'body' | 'finished';

export interface ExecutionError {
  code: string;
  message: string;
}

export interface ExecutionState {
  status: ExecutionStatus;
  startedAt: string | null;
  finishedAt: string | null;
  errors: ExecutionError[];
  result: unknown;
}

export interface HookExecution extends ExecutionState {
  id: string;
  key: string;
  phase: HookPhase;
  action: string;
}

export interface StepExecution extends ExecutionState {
  id: string;
  title: string;
  action: string;
  input: unknown;
  dependsOn: string[];
  phase: ExecutionPhase;
  hooks: HookExecution[];
}

export interface ExecutionOutput {
  sequence: number;
  at: string;
  stepId: string | null;
  hookId: string | null;
  stream: 'stdout' | 'stderr';
  text: string;
}

export interface Run extends ExecutionState {
  id: string;
  sessionId: string | null;
  source: string;
  task: string;
  input: TaskInput;
  target: unknown;
  retention: 'memory';
  createdAt: string;
  dependsOn: string[];
  phase: ExecutionPhase;
  hooks: HookExecution[];
  steps: StepExecution[];
  output: ExecutionOutput[];
  outputTruncated: boolean;
}
