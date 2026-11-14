import { rm, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getDataDirectory, prepareDataDirectory } from './data-directory';

describe('getDataDirectory', () => {
  it('未指定时使用用户主目录下的 .deploy-crab', () => {
    expect(getDataDirectory()).toBe(join(homedir(), '.deploy-crab'));
  });

  it('指定时优先使用，相对路径按工作目录解析', () => {
    expect(getDataDirectory('/srv/dc')).toBe('/srv/dc');
    expect(getDataDirectory('data')).toBe(join(process.cwd(), 'data'));
  });
});

describe('prepareDataDirectory', () => {
  const parent = join(tmpdir(), `deploy-crab-dir-${process.pid}`);
  const target = join(parent, 'nested');
  afterEach(() => rm(parent, { recursive: true, force: true }));

  it('逐级创建目录，权限为 0700，重复调用不报错', async () => {
    expect(await prepareDataDirectory(target)).toBe(target);
    await prepareDataDirectory(target);
    expect((await stat(target)).mode & 0o777).toBe(0o700);
  });
});
