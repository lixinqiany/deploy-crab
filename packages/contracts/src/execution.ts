import type { TaskInput } from './task-input';

/** 临时连接检查使用内存，Session 的执行记录持久化。 */
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
  childRunId?: string;
  id: string;
  key: string;
  phase: HookPhase;
  action: string;
}

export interface StepExecution extends ExecutionState {
  childRunId?: string;
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
  retention: 'memory' | 'persistent';
  parentRunId?: string;
  requestId?: string;
  requestHash?: string;
  taskId?: string;
  taskRevision?: number;
  targetName?: string;
  skippedSteps?: string[];
  createdAt: string;
  dependsOn: string[];
  phase: ExecutionPhase;
  hooks: HookExecution[];
  steps: StepExecution[];
  output: ExecutionOutput[];
  outputTruncated: boolean;
}
