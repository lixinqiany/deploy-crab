import { Host } from '@deploy-crab/contracts/host';
import { eq, inArray } from 'drizzle-orm';
import type { DatabaseSession } from '../database/database';
import { hosts } from '../database/tables/hosts';
import {
  isForeignKeyConstraint,
  isSqliteConstraint,
} from '../database/sqlite-error';
import {
  ConflictError,
  InUseError,
  InvalidReferenceError,
} from '../errors/domain-error';

export class HostRepository {
  constructor(private readonly db: DatabaseSession) {}

  list(): Host[] {
    return this.db
      .select()
      .from(hosts)
      .all()
      .map((row) => Host.parse(row));
  }

  get(id: string): Host | undefined {
    const row = this.db.select().from(hosts).where(eq(hosts.id, id)).get();
    return row === undefined ? undefined : Host.parse(row);
  }

  findByName(name: string): Host | undefined {
    const row = this.db
      .select()
      .from(hosts)
      .where(eq(hosts.nameKey, name.toLowerCase()))
      .get();
    return row === undefined ? undefined : Host.parse(row);
  }

  findJumpDependents(id: string): string[] {
    return this.db
      .select({ name: hosts.name })
      .from(hosts)
      .where(eq(hosts.jumpHostId, id))
      .all()
      .map((row) => row.name);
  }

  findMissingIds(ids: string[]): string[] {
    if (ids.length === 0) return [];
    const found = new Set(
      this.db
        .select({ id: hosts.id })
        .from(hosts)
        .where(inArray(hosts.id, ids))
        .all()
        .map((row) => row.id),
    );
    return ids.filter((id) => !found.has(id));
  }

  insert(host: Host): void {
    const valid = Host.parse(host);
    this.save(valid, () =>
      this.db
        .insert(hosts)
        .values({ ...valid, nameKey: valid.name.toLowerCase() })
        .run(),
    );
  }

  update(host: Host): void {
    const valid = Host.parse(host);
    this.save(valid, () =>
      this.db
        .update(hosts)
        .set({ ...valid, nameKey: valid.name.toLowerCase() })
        .where(eq(hosts.id, valid.id))
        .run(),
    );
  }

  delete(host: Host): void {
    try {
      this.db.delete(hosts).where(eq(hosts.id, host.id)).run();
    } catch (error) {
      if (isForeignKeyConstraint(error)) {
        throw new InUseError(`主机 ${host.name} 仍被其他资源引用，不能删除`, {
          cause: error,
        });
      }
      throw error;
    }
  }

  private save(host: Host, operation: () => unknown): void {
    try {
      operation();
    } catch (error) {
      if (
        isSqliteConstraint(error, 'SQLITE_CONSTRAINT_UNIQUE', 'hosts.name_key')
      ) {
        throw new ConflictError(`名称 ${host.name} 已被其他主机使用`, {
          cause: error,
        });
      }
      if (isForeignKeyConstraint(error)) {
        throw new InvalidReferenceError(`跳板主机 ${host.jumpHostId} 不存在`, {
          cause: error,
        });
      }
      throw error;
    }
  }
}
