import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalSecretStore } from '@deploy-crab/core/secrets/local-secret-store';
import {
  Database,
  DATABASE_FILENAME,
} from '@deploy-crab/core/database/database';
import {
  type DynamicModule,
  Inject,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';

export interface DatabaseModuleOptions {
  dataDirectory: string;
  /** 源码测试显式传入；交付产物使用入口文件旁的 migrations/。 */
  migrationsDirectory?: string;
}

@Module({})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(Database) private readonly database: Database) {}

  static forRoot({
    dataDirectory,
    migrationsDirectory = fileURLToPath(
      new URL('./migrations/', import.meta.url),
    ),
  }: DatabaseModuleOptions): DynamicModule {
    return {
      module: DatabaseModule,
      global: true,
      providers: [
        {
          provide: LocalSecretStore,
          useFactory: () => new LocalSecretStore(dataDirectory),
        },
        {
          provide: Database,
          useFactory: () =>
            new Database(
              join(dataDirectory, DATABASE_FILENAME),
              migrationsDirectory,
            ),
        },
      ],
      exports: [Database, LocalSecretStore],
    };
  }

  onApplicationShutdown(): void {
    this.database.close();
  }
}
