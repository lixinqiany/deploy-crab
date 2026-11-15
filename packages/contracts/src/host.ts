import { z } from 'zod';
import { HostNetwork } from './enums/host';
import type { ApiErrorIssue } from './error';
import { auditFields, Description, DisplayName, ResourceId } from './fields';

/**
 * SSH 认证方式。只保存引用，不保存秘密本身：
 * - `agent`：使用运行节点上的 ssh-agent
 * - `key`：使用运行节点上的私钥文件
 *
 * 用 `method` 区分，以后可以加入新的方式而不影响已有数据。
 */
export const HostAuth = z
  .discriminatedUnion('method', [
    z.object({ method: z.literal('agent') }).meta({ id: 'AgentAuth' }),
    z
      .object({
        method: z.literal('key'),
        /** 运行节点上的私钥路径，可以用 `~/` 开头 */
        keyPath: z
          .string({ error: '请填写私钥路径' })
          .trim()
          .min(1, '请填写私钥路径')
          .max(1024)
          // 中文输入法下容易打出全角的「～」，ssh 不认，换成半角 `~`
          .transform((path) => path.replace(/^～(?=\/|$)/, '~')),
      })
      .meta({ id: 'KeyAuth' }),
  ])
  .meta({ id: 'HostAuth' });
export type HostAuth = z.infer<typeof HostAuth>;

/** 主机地址：域名、IPv4 或 IPv6，不含协议、用户名和端口。 */
export const HostAddress = z
  .string({ error: '请填写地址' })
  .trim()
  .min(1, '请填写地址')
  .max(253, '地址过长')
  .regex(/^[^\s/@]+$/, '地址不能包含空格、斜杠或 @');

/** 可选的地址，`null` 表示未填写 */
const OptionalAddress = HostAddress.nullable();

/** 每种网络对应的地址字段 */
export const ADDRESS_FIELD = {
  public: 'publicAddress',
  private: 'privateAddress',
} as const satisfies Record<HostNetwork, string>;

/** 与地址有关的三个字段 */
export interface HostAddresses {
  publicAddress: string | null;
  privateAddress: string | null;
  connectVia: HostNetwork;
}

/**
 * SSH 连接这台主机用的地址，即 `connectVia` 选中的那个。
 * 这个地址是从「上一跳」去连的：直连时是运行节点，经跳板时是跳板主机。
 */
export const connectAddress = (host: HostAddresses): string | null =>
  host[ADDRESS_FIELD[host.connectVia]];

/**
 * 地址的组合规则：至少填一个，且 `connectVia` 选中的那个必须填写。
 * 新建时由 schema 检查；修改时只传部分字段，由 core 合并后再检查。
 */
export const hostAddressIssues = (host: HostAddresses): ApiErrorIssue[] => {
  if (host.publicAddress === null && host.privateAddress === null) {
    return [
      {
        path: [ADDRESS_FIELD.public],
        message: '外网地址和内网地址至少填写一个',
      },
    ];
  }
  if (connectAddress(host) === null) {
    const network = host.connectVia === 'public' ? '外网' : '内网';
    return [
      {
        path: [ADDRESS_FIELD[host.connectVia]],
        message: `已选择经${network}连接，请填写${network}地址`,
      },
    ];
  }
  return [];
};

const checkAddresses = (host: HostAddresses, ctx: z.RefinementCtx) => {
  for (const issue of hostAddressIssues(host)) {
    ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
  }
};

/**
 * 没有指定 `connectVia` 时的默认值：只填了一个地址就用它；
 * 两个都填了，经跳板时用内网，直连时用外网。
 */
export const defaultConnectVia = (
  host: Pick<HostAddresses, 'publicAddress' | 'privateAddress'> & {
    jumpHostId: string | null;
  },
): HostNetwork => {
  if (host.publicAddress === null && host.privateAddress !== null)
    return 'private';
  if (host.privateAddress === null && host.publicAddress !== null)
    return 'public';
  return host.jumpHostId === null ? 'public' : 'private';
};

export const SshPort = z
  .number({ error: '端口必须是数字' })
  .int('端口必须是整数')
  .min(1, '端口范围 1–65535')
  .max(65535, '端口范围 1–65535');

export const SshUser = z
  .string({ error: '请填写登录用户' })
  .trim()
  .min(1, '请填写登录用户')
  .max(64, '用户名过长')
  .regex(/^[^\s@:]+$/, '用户名不能包含空格、@ 或冒号');

export const HostLabel = z
  .string()
  .trim()
  .min(1, '标签不能为空')
  .max(32, '标签最多 32 个字符')
  .regex(/^\S+$/, '标签不能包含空格');

const HostLabels = z
  .array(HostLabel)
  .max(20, '最多 20 个标签')
  .refine((labels) => new Set(labels).size === labels.length, '标签不能重复');

/**
 * 跳板主机的 id；`null` 表示从运行节点直连。
 * 跳板本身也可以再经过跳板，多跳链路由此自然形成。
 */
const JumpHostId = ResourceId.nullable();

/** 主机的可编辑字段，新建、修改和完整记录共用 */
const hostFields = {
  name: DisplayName,
  /** 外网地址：公网 IP 或域名 */
  publicAddress: OptionalAddress,
  /** 内网地址：所在 VPC 或局域网内的 IP，部署时集群内互相访问也用它 */
  privateAddress: OptionalAddress,
  /** SSH 用哪个地址连接 */
  connectVia: HostNetwork,
  port: SshPort,
  user: SshUser,
  auth: HostAuth,
  jumpHostId: JumpHostId,
  labels: HostLabels,
  description: Description,
};

/** 已保存的主机 */
export const Host = z
  .object({ id: ResourceId, ...hostFields, ...auditFields })
  .superRefine(checkAddresses)
  .meta({ id: 'Host' });
export type Host = z.infer<typeof Host>;

/**
 * 新建主机：名称、用户和至少一个地址必填，其余字段使用默认值。
 * 不传 `connectVia` 时按 `defaultConnectVia` 选择。
 */
export const CreateHostInput = z
  .object({
    ...hostFields,
    publicAddress: OptionalAddress.default(null),
    privateAddress: OptionalAddress.default(null),
    connectVia: HostNetwork.optional(),
    port: SshPort.default(22),
    auth: HostAuth.default({ method: 'agent' }),
    jumpHostId: JumpHostId.default(null),
    labels: HostLabels.default([]),
    description: Description.default(''),
  })
  .transform(({ connectVia, ...host }) => ({
    ...host,
    connectVia: connectVia ?? defaultConnectVia(host),
  }))
  .superRefine(checkAddresses)
  .meta({ id: 'CreateHostInput' });
export type CreateHostInput = z.output<typeof CreateHostInput>;
/** 新建主机的请求体：带默认值的字段可以省略 */
export type CreateHostBody = z.input<typeof CreateHostInput>;

/**
 * 修改主机：只修改传入的字段；`jumpHostId: null` 表示改回直连。
 * 地址的组合规则要看合并后的结果，由 core 检查。
 */
export const UpdateHostInput = z
  .object(hostFields)
  .partial()
  .meta({ id: 'UpdateHostInput' });
export type UpdateHostInput = z.output<typeof UpdateHostInput>;
/** 修改主机的请求体 */
export type UpdateHostBody = z.input<typeof UpdateHostInput>;
