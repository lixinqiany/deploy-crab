import { ConnectionTarget } from '@deploy-crab/contracts/connection';
import type { Action } from '../execution/definition';
import type { SshRunner } from '../ssh/ssh-runner';

export const sshProbeAction = (runner: SshRunner): Action => ({
  key: 'ssh.probe',
  execute: (_input, context) =>
    runner.probe(ConnectionTarget.parse(context.target), context),
});
