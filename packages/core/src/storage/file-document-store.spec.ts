import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';
import type { DocumentSchema } from './document-store';
import {
  FileDocumentStore,
  type InvalidDocumentHandler,
} from './file-document-store';
import { YamlFormat } from './yaml-format';

interface Note {
  id: string;
  title: string;
}

/** 手写的最小 schema，只要有 parse 方法就行 */
const NoteSchema: DocumentSchema<Note> = {
  parse(data) {
    const { id, title } = (data ?? {}) as Partial<Note>;
    if (typeof id !== 'string' || typeof title !== 'string') {
      throw new Error('invalid note');
    }
    return { id, title };
  },
};

describe('FileDocumentStore（YAML 格式）', () => {
  let root: string;
  let onInvalidDocument: Mock<InvalidDocumentHandler>;
  let store: FileDocumentStore;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'deploy-crab-core-'));
    onInvalidDocument = vi.fn<InvalidDocumentHandler>();
    store = new FileDocumentStore(root, new YamlFormat(), {
      onInvalidDocument,
    });
  });
  afterEach(() => rm(root, { recursive: true, force: true }));

  const notes = () => store.collection('notes', NoteSchema);

  it('集合目录不存在时视为空集合', async () => {
    expect(await notes().list()).toEqual([]);
    expect(await notes().get('missing')).toBeUndefined();
  });

  it('每个文档写成一个 YAML 文件，可以读回', async () => {
    await notes().put({ id: 'n1', title: '你好' });

    expect(await readFile(join(root, 'notes', 'n1.yaml'), 'utf8')).toBe(
      'id: n1\ntitle: 你好\n',
    );
    expect(await notes().get('n1')).toEqual({ id: 'n1', title: '你好' });
    expect(await notes().list()).toEqual([{ id: 'n1', title: '你好' }]);
  });

  it('put 整体替换，delete 返回是否真的删除', async () => {
    await notes().put({ id: 'n1', title: 'old' });
    await notes().put({ id: 'n1', title: 'new' });
    expect(await notes().get('n1')).toEqual({ id: 'n1', title: 'new' });

    expect(await notes().delete('n1')).toBe(true);
    expect(await notes().delete('n1')).toBe(false);
    expect(await notes().list()).toEqual([]);
  });

  it('写入后不留下临时文件', async () => {
    await notes().put({ id: 'n1', title: 'a' });
    expect(await readdir(join(root, 'notes'))).toEqual(['n1.yaml']);
  });

  it('不符合 schema 的数据拒绝写入', async () => {
    const bad = { id: 'n1' } as Note;
    await expect(notes().put(bad)).rejects.toThrow('invalid note');
  });

  it('被手工改坏的文件会被跳过并上报，不影响其他文档', async () => {
    await notes().put({ id: 'good', title: 'ok' });
    await writeFile(join(root, 'notes', 'broken.yaml'), 'title: [unclosed');
    await writeFile(join(root, 'notes', 'wrong.yaml'), 'id: wrong\n');

    expect(await notes().list()).toEqual([{ id: 'good', title: 'ok' }]);
    expect(onInvalidDocument).toHaveBeenCalledTimes(2);
  });

  it('拒绝可能造成路径穿越的集合名和 id', async () => {
    expect(() => store.collection('../etc', NoteSchema)).toThrow(
      'Invalid collection name',
    );
    await expect(notes().get('../secret')).rejects.toThrow(
      'Invalid document id',
    );
  });

  it('exclusive 让「先检查再写入」不被并发打断', async () => {
    // 两个请求同时想创建同名文档：只有第一个能成功
    const createOnce = (title: string) =>
      store.exclusive(async () => {
        const exists = (await notes().list()).some((n) => n.title === title);
        if (exists) return false;
        await notes().put({
          id: `n${Math.random().toString(36).slice(2)}`,
          title,
        });
        return true;
      });

    const results = await Promise.all([createOnce('同名'), createOnce('同名')]);
    expect(results.sort()).toEqual([false, true]);
    expect(await notes().list()).toHaveLength(1);
  });
});
