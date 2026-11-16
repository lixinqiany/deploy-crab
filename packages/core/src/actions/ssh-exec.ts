import { ConnectionTarget } from '@deploy-crab/contracts/connection';
import { SshScriptInput } from '@deploy-crab/contracts/ssh-script';
import type { Action } from '../execution/definition';
import type { SshRunner } from '../ssh/ssh-runner';
import { TaskInput } from '@deploy-crab/contracts/task-input';
import { ExecutionFailure } from '../execution/execution-failure';
import { secretRedactor } from '../secrets/redact';

export const sshExecAction = (
  runner: SshRunner,
  resolveSecret?: (id: string) => string,
): Action => ({
  key: 'ssh.exec',
  execute: async (input, context) => {
    const script = SshScriptInput.parse(input);
    const taskInput = structuredClone(context.taskInput),
      secrets: string[] = [];
    for (const name of context.secretInputs ?? []) {
      const reference = taskInput[name];
      if (reference === undefined) continue;
      if (!resolveSecret || typeof reference !== 'string')
        throw new ExecutionFailure('secret_unavailable', '凭据不可用');
      const value = resolveSecret(reference);
      taskInput[name] = value;
      secrets.push(value);
    }
    const redact = (text: string) => {
      let result = '';
      const filter = secretRedactor(secrets, (part) => {
        result += part;
      });
      filter.write(text);
      filter.end();
      return result;
    };
    const logs = {
      stdout: secretRedactor(secrets, (text) => context.output('stdout', text)),
      stderr: secretRedactor(secrets, (text) => context.output('stderr', text)),
    };
    let json = '',
      oversized = false;
    let result;
    try {
      result = await runner.exec(
        ConnectionTarget.parse(context.target),
        script,
        taskInput,
        {
          ...context,
          output: (stream, text) => {
            if (script.output !== 'json' || stream === 'stderr') {
              logs[stream].write(text);
              return;
            }
            if (json.length + text.length > 16_000) oversized = true;
            else if (!oversized) json += text;
          },
        },
      );
    } catch (error) {
      throw new ExecutionFailure(
        error instanceof ExecutionFailure ? error.code : 'execution_failed',
        redact(error instanceof Error ? error.message : '执行失败'),
      );
    } finally {
      logs.stdout.end();
      logs.stderr.end();
    }
    if (script.output !== 'json') return result;
    if (oversized)
      throw new ExecutionFailure(
        'invalid_output',
        'JSON 结果不能超过 16000 字符',
      );
    try {
      const value: unknown = JSON.parse(redact(json));
      return TaskInput.parse({ value }).value;
    } catch {
      throw new ExecutionFailure(
        'invalid_output',
        '脚本须将一个合法 JSON 值写到 stdout，诊断日志请写到 stderr',
      );
    }
  },
});
