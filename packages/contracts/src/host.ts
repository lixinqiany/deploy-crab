import { z } from 'zod';
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
          .max(1024),
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
  address: HostAddress,
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
  .meta({ id: 'Host' });
export type Host = z.infer<typeof Host>;

/** 新建主机：只有名称、地址和用户必填，其余字段使用默认值 */
export const CreateHostInput = z
  .object({
    ...hostFields,
    port: SshPort.default(22),
    auth: HostAuth.default({ method: 'agent' }),
    jumpHostId: JumpHostId.default(null),
    labels: HostLabels.default([]),
    description: Description.default(''),
  })
  .meta({ id: 'CreateHostInput' });
export type CreateHostInput = z.output<typeof CreateHostInput>;

/** 修改主机：只修改传入的字段；`jumpHostId: null` 表示改回直连 */
export const UpdateHostInput = z
  .object(hostFields)
  .partial()
  .meta({ id: 'UpdateHostInput' });
export type UpdateHostInput = z.output<typeof UpdateHostInput>;
