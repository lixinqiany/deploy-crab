import { SshScriptInput } from '@deploy-crab/contracts/ssh-script';
import { TaskInput } from '@deploy-crab/contracts/task-input';
import type { TaskExecutionContext } from '@deploy-crab/contracts/task-placement';

const shellLiteral = (value: string): string =>
  "'" + value.replaceAll("'", "'\"'\"'") + "'";

/** 通过 SSH stdin 传输；参数只作为 JSON 数据，不做模板替换或 eval。 */
export function sshScript(
  script: SshScriptInput,
  input: TaskInput,
  context?: TaskExecutionContext,
): string {
  const config = SshScriptInput.parse(script);
  const json = JSON.stringify(TaskInput.parse(input));
  if (context && JSON.stringify(context).length > 128_000)
    throw new Error('执行上下文超过 128000 字符，请缩小步骤的结构化结果');
  return [
    `export DEPLOY_CRAB_INPUT=${shellLiteral(json)}`,
    `export DEPLOY_CRAB_CONTEXT=${shellLiteral(JSON.stringify(context ?? { targets: [] }))}`,
    ...(config.cwd ? [`cd -- ${shellLiteral(config.cwd)} || exit 1`] : []),
    config.script,
    '',
  ].join('\n');
}
