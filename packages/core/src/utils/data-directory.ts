import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { DATA_DIRECTORY_NAME } from '@deploy-crab/contracts/constants/runtime';

/**
 * 解析实例数据目录：指定了就用指定的，否则用 `~/.deploy-crab/`。
 *
 * `override` 来自启动参数 `--data-dir`，相对路径按启动工作目录解析。
 * 开发模式的数据目录由开发启动命令传入，这里不区分运行模式。
 */
export function getDataDirectory(override?: string): string {
  return override ? resolve(override) : join(homedir(), DATA_DIRECTORY_NAME);
}

/** 解析数据目录并确保它存在；新建时权限为 0700，只有当前用户可以访问。 */
export async function prepareDataDirectory(override?: string): Promise<string> {
  const directory = getDataDirectory(override);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  return directory;
}
