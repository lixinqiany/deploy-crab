import {
  connectAddress,
  type HostAddresses,
  type HostAuth,
} from '@deploy-crab/contracts/host';

/** 生成 ssh 命令只需要这些字段，表单里填到一半的数据也能用 */
export interface SshEndpoint extends HostAddresses {
  name?: string;
  port: number;
  user: string;
  auth: HostAuth;
  jumpHostId: string | null;
}

/** SSH 连接用的地址；还没填时用占位符 */
const addressOf = (host: SshEndpoint) => connectAddress(host) ?? '<地址>';

/** `user@address`，端口不是 22 时追加 `:port`，用于 `-J` 和展示 */
export const sshTarget = (host: SshEndpoint) =>
  `${host.user || '<用户>'}@${addressOf(host)}${host.port === 22 ? '' : `:${host.port}`}`;

/**
 * 从目标主机往上找跳板，返回从运行节点出发的顺序（最先连接的在前）。
 * 遇到不存在的主机或环时停下，不会死循环。
 */
export const jumpChain = <T extends SshEndpoint & { id?: string }>(
  host: SshEndpoint,
  byId: ReadonlyMap<string, T>,
): T[] => {
  const chain: T[] = [];
  const seen = new Set<string>();
  let nextId = host.jumpHostId;
  while (nextId && !seen.has(nextId)) {
    seen.add(nextId);
    const jump = byId.get(nextId);
    if (!jump) break;
    chain.unshift(jump);
    nextId = jump.jumpHostId;
  }
  return chain;
};

/** 怎样用 ssh 连上这台主机：一行命令，或者一段 `~/.ssh/config` */
export interface SshSnippet {
  kind: 'command' | 'config';
  text: string;
}

/**
 * 与主机配置等价的 ssh 用法。
 *
 * 多跳时每一跳的地址都是从前一跳去连的，所以各自取自己的连接地址：
 * `ssh -J ops@1.2.3.4,ops@10.0.0.5 deploy@10.0.1.11`
 *
 * `-i` 只对最后一台生效，跳板主机用私钥文件时一行命令写不下，
 * 改为生成 `~/.ssh/config`，每台主机各自写 `IdentityFile`。
 */
export const sshSnippet = (
  host: SshEndpoint,
  byId: ReadonlyMap<string, SshEndpoint>,
): SshSnippet => {
  const chain = jumpChain(host, byId);
  return chain.some((jump) => jump.auth.method === 'key')
    ? { kind: 'config', text: sshConfig([...chain, host]) }
    : { kind: 'command', text: sshCommand(host, chain) };
};

const sshCommand = (host: SshEndpoint, chain: SshEndpoint[]): string => {
  const parts = ['ssh'];
  if (chain.length > 0) parts.push('-J', chain.map(sshTarget).join(','));
  if (host.port !== 22) parts.push('-p', String(host.port));
  if (host.auth.method === 'key' && host.auth.keyPath) {
    parts.push('-i', host.auth.keyPath);
  }
  parts.push(`${host.user || '<用户>'}@${addressOf(host)}`);
  return parts.join(' ');
};

/** ssh 配置里的 Host 别名不能有空格，其余字符替换成 `-` */
const aliasOf = (host: SshEndpoint) =>
  (host.name ?? '').trim().replace(/[^\w.-]+/g, '-') || 'target';

/** `steps` 从第一跳到目标主机 */
const sshConfig = (steps: SshEndpoint[]): string => {
  const blocks = steps.map((step, index) => {
    const lines = [
      `Host ${aliasOf(step)}`,
      `  HostName ${addressOf(step)}`,
      `  User ${step.user || '<用户>'}`,
    ];
    if (step.port !== 22) lines.push(`  Port ${step.port}`);
    if (step.auth.method === 'key' && step.auth.keyPath) {
      lines.push(`  IdentityFile ${step.auth.keyPath}`);
    }
    const previous = steps[index - 1];
    if (previous) lines.push(`  ProxyJump ${aliasOf(previous)}`);
    return lines.join('\n');
  });
  const target = steps.at(-1);
  const usage = target
    ? `# 加入 ~/.ssh/config 后执行：ssh ${aliasOf(target)}`
    : '';
  return [usage, ...blocks].join('\n\n');
};

/** 复制按钮用：要复制的文字和按钮的无障碍名称 */
export const sshCopyProps = (
  host: SshEndpoint & { name: string },
  byId: ReadonlyMap<string, SshEndpoint>,
) => {
  const snippet = sshSnippet(host, byId);
  const what = snippet.kind === 'command' ? 'ssh 命令' : 'ssh 配置';
  return { text: snippet.text, label: `复制 ${host.name} 的 ${what}` };
};
