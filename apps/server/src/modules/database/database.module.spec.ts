import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Database } from '@deploy-crab/core/database/database';
import { HostRepository } from '@deploy-crab/core/inventory/host-repository';
import { Test } from '@nestjs/testing';
import { DatabaseModule } from './database.module';

const migrationsDirectory = fileURLToPath(
  new URL(
    '../../migrations/',
    import.meta.resolve('@deploy-crab/core/database/database'),
  ),
);

describe('DatabaseModule', () => {
  it('启动时迁移数据目录内的数据库，并在模块关闭时释放连接', async () => {
    const dataDirectory = await mkdtemp(
      join(tmpdir(), 'deploy-crab-database-module-'),
    );
    try {
      const moduleRef = await Test.createTestingModule({
        imports: [
          DatabaseModule.forRoot({ dataDirectory, migrationsDirectory }),
        ],
      }).compile();
      const database = moduleRef.get(Database);
      try {
        expect(database.read((tx) => new HostRepository(tx).list())).toEqual(
          [],
        );
        expect(await readdir(dataDirectory)).toContain('deploy-crab.sqlite');
      } finally {
        await moduleRef.close();
      }
      expect(() =>
        database.read((tx) => new HostRepository(tx).list()),
      ).toThrow();
    } finally {
      await rm(dataDirectory, { recursive: true, force: true });
    }
  });
});
