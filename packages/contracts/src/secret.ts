import { z } from 'zod';
import { ResourceId } from './fields';

export const SecretSummary = z.object({
  id: ResourceId,
  name: z.string().min(1).max(100),
  createdAt: z.string(),
});
export type SecretSummary = z.output<typeof SecretSummary>;
export const CreateSecret = z
  .object({
    name: z.string().trim().min(1).max(100),
    /** 不提供时生成可用于密码或 MongoDB keyfile 的随机凭据。 */
    value: z.string().min(16).max(4096).optional(),
  })
  .strict();
export type CreateSecret = z.output<typeof CreateSecret>;
