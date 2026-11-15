import { z } from 'zod';

/**
 * 主机所在的网络，决定 SSH 用哪个地址连接它：
 * - `public`：外网地址
 * - `private`：内网地址
 */
export const HostNetwork = z
  .enum(['public', 'private'])
  .meta({ id: 'HostNetwork' });
export type HostNetwork = z.infer<typeof HostNetwork>;
