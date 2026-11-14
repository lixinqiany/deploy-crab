import { randomBytes } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * 原子写文件：先写到同目录下的临时文件，再用 rename 替换目标文件。
 * rename 在同一文件系统内是原子的，读的一方要么看到旧内容，要么看到完整的新内容，
 * 进程中途崩溃也不会留下写了一半的文件。
 */
export async function writeFileAtomic(
  path: string,
  content: string,
  mode = 0o600,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    await writeFile(temporary, content, { mode });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
