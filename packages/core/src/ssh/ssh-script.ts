import { SshScriptInput } from '@deploy-crab/contracts/ssh-script';
import { TaskInput } from '@deploy-crab/contracts/task-input';

const shellLiteral = (value: string): string =>
  "'" + value.replaceAll("'", "'\"'\"'") + "'";

/** 通过 SSH stdin 传输；参数只作为 JSON 数据，不做模板替换或 eval。 */
export function sshScript(script: SshScriptInput, input: TaskInput): string {
  const config = SshScriptInput.parse(script);
  const json = JSON.stringify(TaskInput.parse(input));
  return [
    `export DEPLOY_CRAB_INPUT=${shellLiteral(json)}`,
    ...(config.cwd ? [`cd -- ${shellLiteral(config.cwd)} || exit 1`] : []),
    config.script,
    '',
  ].join('\n');
}
