import { z } from 'zod';

/** Action 的脚本配置，与调用任务时传入的数据分开。 */
export const SshScriptInput = z
  .object({
    script: z
      .string()
      .max(16_000, '脚本最多 16000 个字符')
      .refine((s) => s.trim().length > 0, '请填写脚本'),
    shell: z.enum(['bash', 'sh']).default('bash'),
    cwd: z
      .string()
      .trim()
      .min(1, '工作目录不能为空')
      .max(1024)
      .nullable()
      .default(null),
  })
  .strict();
export type SshScriptInput = z.output<typeof SshScriptInput>;

export interface SshScriptResult {
  exitCode: 0;
  elapsedMs: number;
}
