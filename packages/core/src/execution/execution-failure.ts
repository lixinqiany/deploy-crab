import type { ExecutionError } from '@deploy-crab/contracts/execution';

export class ExecutionFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ExecutionFailure';
  }
}

export const executionError = (error: unknown): ExecutionError => ({
  code: error instanceof ExecutionFailure ? error.code : 'execution_failed',
  message: error instanceof Error ? error.message : '执行失败',
});

export function checkAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason instanceof ExecutionFailure
      ? signal.reason
      : new ExecutionFailure('cancelled', '执行已取消');
  }
}
