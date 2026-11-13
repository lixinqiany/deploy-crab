import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type RuntimeMode = 'development' | 'production';

/** 数据目录名：开发时放在仓库根目录，正式运行时放在用户主目录。 */
const DATA_DIRECTORY_NAME = '.deploy-crab';

/**
 * 解析实例数据目录。
 *
 * - 传入 `override`（来自启动参数 `--data-dir`）时优先使用，相对路径按启动工作目录解析。
 * - 开发模式固定为仓库根目录下的 `.deploy-crab/`，从模块位置推算，与工作目录无关。
 * - 正式运行固定为 `~/.deploy-crab/`。
 */
export function getDataDirectory(mode: RuntimeMode, override?: string): string {
  if (override) return resolve(override);
  return mode === 'development'
    ? fileURLToPath(
        new URL(`../../../${DATA_DIRECTORY_NAME}/`, import.meta.url),
      )
    : join(homedir(), DATA_DIRECTORY_NAME);
}

export async function prepareDataDirectory(
  mode: RuntimeMode,
  override?: string,
): Promise<string> {
  const directory = getDataDirectory(mode, override);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  return directory;
}
