import type {
  ConnectionTarget,
  ProbeResult,
} from '@deploy-crab/contracts/connection';
import type {
  SshScriptInput,
  SshScriptResult,
} from '@deploy-crab/contracts/ssh-script';
import type { TaskInput } from '@deploy-crab/contracts/task-input';
import type { TaskExecutionContext } from '@deploy-crab/contracts/task-placement';

export interface SshContext {
  executionContext?: TaskExecutionContext;
  signal: AbortSignal;
  output(stream: 'stdout' | 'stderr', text: string): void;
}

export abstract class SshRunner {
  abstract exec(
    target: ConnectionTarget,
    script: SshScriptInput,
    input: TaskInput,
    context: SshContext,
  ): Promise<SshScriptResult>;

  abstract probe(
    target: ConnectionTarget,
    context: SshContext,
  ): Promise<ProbeResult>;
}
