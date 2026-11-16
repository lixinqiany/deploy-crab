import Sqlite from 'better-sqlite3';
import {
  type BetterSQLite3Database,
  drizzle,
} from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

export const DATABASE_FILENAME = 'deploy-crab.sqlite';

/** 仓储只接收当前事务的查询能力，不能自行开启或提交事务。 */
export type DatabaseSession = Pick<
  BetterSQLite3Database<typeof schema>,
  'select' | 'insert' | 'update' | 'delete'
>;

/** 一个实例共用一个连接；调用方负责数据目录和迁移资源的位置。 */
export class Database {
  readonly #sqlite: Sqlite.Database;
  readonly #db: BetterSQLite3Database<typeof schema>;

  constructor(filename: string, migrationsDirectory: string) {
    this.#sqlite = new Sqlite(filename, { timeout: 5000 });
    try {
      this.#sqlite.pragma('foreign_keys = ON');
      this.#sqlite.pragma('journal_mode = WAL');
      this.#sqlite.pragma('synchronous = FULL');
      this.#db = drizzle(this.#sqlite, { schema });
      migrate(this.#db, { migrationsFolder: migrationsDirectory });
    } catch (error) {
      this.#sqlite.close();
      throw error;
    }
  }

  /** 多条读取共享一个快照。回调必须同步完成，不能返回 Promise。 */
  read<T>(operation: (session: DatabaseSession) => T): T {
    return this.#db.transaction((tx) => this.runSync(operation, tx));
  }

  /** 检查和修改共用写事务；在读取业务状态前取得写权限。 */
  write<T>(operation: (session: DatabaseSession) => T): T {
    return this.#db.transaction((tx) => this.runSync(operation, tx), {
      behavior: 'immediate',
    });
  }

  close(): void {
    if (this.#sqlite.open) this.#sqlite.close();
  }

  private runSync<T>(
    operation: (session: DatabaseSession) => T,
    session: DatabaseSession,
  ): T {
    if (operation.constructor.name === 'AsyncFunction') {
      throw new TypeError(
        'Database transactions require a synchronous callback.',
      );
    }
    const result = operation(session);
    if (result !== null && typeof result === 'object' && 'then' in result) {
      throw new TypeError('Database transactions must not return a Promise.');
    }
    return result;
  }
}
