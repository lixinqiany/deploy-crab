import { z } from 'zod';

// 多种资源共用的字段规则。

/** 资源标识，由 server 生成。 */
export const ResourceId = z.uuid();

/** 展示名称：去掉首尾空白，在同类资源中唯一（不区分大小写，由 server 保证）。 */
export const DisplayName = z
  .string({ error: '请填写名称' })
  .trim()
  .min(1, '名称不能为空')
  .max(64, '名称最多 64 个字符');

export const Description = z.string().trim().max(500, '描述最多 500 个字符');

/** 持久化资源共有的创建、更新时间，ISO 8601 格式。 */
export const auditFields = {
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
};
