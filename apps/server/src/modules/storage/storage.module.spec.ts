import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DocumentStore } from '@deploy-crab/core/storage/document-store';
import { FileDocumentStore } from '@deploy-crab/core/storage/file-document-store';
import { Test } from '@nestjs/testing';
import { StorageModule } from './storage.module';

describe('StorageModule', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await mkdtemp(join(tmpdir(), 'deploy-crab-storage-'));
  });

  afterEach(async () => {
    await rm(dataDirectory, { recursive: true, force: true });
  });

  it('以 DocumentStore 为 token 提供 YAML 文件存储，文档写在 store/ 下', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [StorageModule.forRoot({ dataDirectory })],
    }).compile();

    const store = moduleRef.get(DocumentStore);
    expect(store).toBeInstanceOf(FileDocumentStore);

    await store
      .collection('notes', { parse: (data) => data as { id: string } })
      .put({ id: 'a' });

    expect(await readdir(join(dataDirectory, 'store', 'notes'))).toEqual([
      'a.yaml',
    ]);
  });
});
