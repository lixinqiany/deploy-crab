import { z } from 'zod';
import { HostNetwork } from './enums/host';
import { ResourceId } from './fields';
import {
  HostAuth,
  SshPort,
  SshUser,
  defaultConnectVia,
  hostAddressIssues,
} from './host';

// OpenSSH 的跳板内部会展开主机和用户参数，执行输入比展示用字段更严格。
const Address = z
  .string()
  .trim()
  .min(1, '请填写地址')
  .max(253)
  .regex(/^(?!-)[A-Za-z0-9_.:-]+$/, '连接地址仅支持域名、IPv4 或 IPv6');
const User = SshUser.regex(
  /^[A-Za-z0-9_][A-Za-z0-9_.-]*\$?$/,
  '请填写有效的 SSH 登录用户',
);
const Auth = HostAuth.superRefine((auth, ctx) => {
  if (
    auth.method === 'key' &&
    ([...auth.keyPath].some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    ) ||
      auth.keyPath.includes('${'))
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['keyPath'],
      message: '私钥路径不能包含控制字符或环境变量表达式',
    });
  }
});

/** 不要求主机名称和保存操作；编辑时同样检查当前草稿。 */
export const CheckHostInput = z
  .object({
    hostId: ResourceId.nullable().default(null),
    publicAddress: Address.nullable().default(null),
    privateAddress: Address.nullable().default(null),
    connectVia: HostNetwork.optional(),
    port: SshPort.default(22),
    user: User,
    auth: Auth.default({ method: 'agent' }),
    jumpHostId: ResourceId.nullable().default(null),
  })
  .transform(({ connectVia, ...host }) => ({
    ...host,
    connectVia: connectVia ?? defaultConnectVia(host),
  }))
  .superRefine((host, ctx) => {
    for (const issue of hostAddressIssues(host)) {
      ctx.addIssue({
        code: 'custom',
        path: issue.path,
        message: issue.message,
      });
    }
  });
export type CheckHostInput = z.output<typeof CheckHostInput>;
export type CheckHostBody = z.input<typeof CheckHostInput>;

export const ConnectionEndpoint = z.object({
  address: Address,
  port: SshPort,
  user: User,
  auth: Auth,
});
export type ConnectionEndpoint = z.infer<typeof ConnectionEndpoint>;

export const ConnectionTarget = z.object({
  hostId: ResourceId.nullable(),
  endpoint: ConnectionEndpoint,
  jumps: z.array(ConnectionEndpoint).max(16),
});
export type ConnectionTarget = z.infer<typeof ConnectionTarget>;

export interface ProbeResult {
  connected: true;
  elapsedMs: number;
  address: string;
  port: number;
  user: string;
  hopCount: number;
}
