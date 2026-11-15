import type { HostAuth } from '@deploy-crab/contracts/host';

/** 生成 ssh 命令只需要这些字段，表单里填到一半的数据也能用 */
export interface SshEndpoint {
  name?: string;
  address: string;
  port: number;
  user: string;
  auth: HostAuth;
  jumpHostId: string | null;
}

/** `user@address`，端口不是 22 时追加 `:port`，用于 `-J` 和展示 */
export const sshTarget = ({ user, address, port }: SshEndpoint) =>
  `${user}@${address}${port === 22 ? '' : `:${port}`}`;

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

/**
 * 与主机配置等价的 ssh 命令，例如：
 * `ssh -J ops@bastion -p 2222 -i ~/.ssh/id_ed25519 postgres@10.0.2.21`
 */
export const sshCommand = (
  host: SshEndpoint,
  byId: ReadonlyMap<string, SshEndpoint>,
): string => {
  const parts = ['ssh'];
  const chain = jumpChain(host, byId);
  if (chain.length > 0) parts.push('-J', chain.map(sshTarget).join(','));
  if (host.port !== 22) parts.push('-p', String(host.port));
  if (host.auth.method === 'key' && host.auth.keyPath) {
    parts.push('-i', host.auth.keyPath);
  }
  parts.push(`${host.user || '<用户>'}@${host.address || '<地址>'}`);
  return parts.join(' ');
};
