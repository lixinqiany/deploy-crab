import type {
  ConnectionTarget,
  ProbeResult,
} from '@deploy-crab/contracts/connection';

export interface SshContext {
  signal: AbortSignal;
  output(stream: 'stdout' | 'stderr', text: string): void;
}

export abstract class SshRunner {
  abstract probe(
    target: ConnectionTarget,
    context: SshContext,
  ): Promise<ProbeResult>;
}
