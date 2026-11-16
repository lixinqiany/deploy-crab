import { ConnectionTarget } from '@deploy-crab/contracts/connection';
import { SshScriptInput } from '@deploy-crab/contracts/ssh-script';
import type { Action } from '../execution/definition';
import type { SshRunner } from '../ssh/ssh-runner';

export const sshExecAction = (runner: SshRunner): Action => ({
  key: 'ssh.exec',
  execute: (input, context) =>
    runner.exec(
      ConnectionTarget.parse(context.target),
      SshScriptInput.parse(input),
      context.taskInput,
      context,
    ),
});
