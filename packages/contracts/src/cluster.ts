import { z } from 'zod';
import { auditFields, Description, DisplayName, ResourceId } from './fields';

/**
 * 分组名：主机在某个集群里承担的角色，如 `web`、`db-primary`。
 * 只用小写字母、数字和 `-`，便于以后在部署命令里直接引用。
 */
export const ClusterGroup = z
  .string({ error: '请填写分组' })
  .trim()
  .min(1, '分组不能为空')
  .max(32, '分组最多 32 个字符')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    '分组只能包含小写字母、数字和 -，且不能以 - 开头或结尾',
  );

/**
 * 一台主机在集群里所属的分组，至少一个。
 * 一台主机可以同时承担多个角色，例如服务器较少时 infra 和 app 部署在同一台机器上。
 */
const ClusterGroups = z
  .array(ClusterGroup)
  .min(1, '至少选择一个分组')
  .max(20, '最多 20 个分组')
  .refine((groups) => new Set(groups).size === groups.length, '分组不能重复');

/**
 * 集群成员：引用一台主机，并说明它在这个集群里属于哪些分组。
 * 分组属于「主机在某个集群里的角色」，所以存在集群这边；
 * 同一台主机在不同集群里可以属于不同的分组。
 */
export const ClusterMember = z
  .object({
    hostId: ResourceId,
    groups: ClusterGroups,
  })
  .meta({ id: 'ClusterMember' });
export type ClusterMember = z.infer<typeof ClusterMember>;

const ClusterMembers = z
  .array(ClusterMember)
  .max(500, '一个集群最多 500 台主机')
  .refine(
    (members) =>
      new Set(members.map((member) => member.hostId)).size === members.length,
    '同一台主机不能重复加入集群',
  );

/** 集群的可编辑字段，新建、修改和完整记录共用 */
const clusterFields = {
  name: DisplayName,
  description: Description,
  members: ClusterMembers,
};

/** 已保存的集群 */
export const Cluster = z
  .object({ id: ResourceId, ...clusterFields, ...auditFields })
  .meta({ id: 'Cluster' });
export type Cluster = z.infer<typeof Cluster>;

/** 新建集群：只有名称必填，可以先建空集群再添加主机 */
export const CreateClusterInput = z
  .object({
    ...clusterFields,
    description: Description.default(''),
    members: ClusterMembers.default([]),
  })
  .meta({ id: 'CreateClusterInput' });
export type CreateClusterInput = z.output<typeof CreateClusterInput>;
/** 新建集群的请求体：带默认值的字段可以省略 */
export type CreateClusterBody = z.input<typeof CreateClusterInput>;

/** 修改集群：只修改传入的字段；`members` 传入时整体替换成员列表 */
export const UpdateClusterInput = z
  .object(clusterFields)
  .partial()
  .meta({ id: 'UpdateClusterInput' });
export type UpdateClusterInput = z.output<typeof UpdateClusterInput>;
/** 修改集群的请求体 */
export type UpdateClusterBody = z.input<typeof UpdateClusterInput>;
