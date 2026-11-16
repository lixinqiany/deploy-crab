import { Cluster, type ClusterMember } from '@deploy-crab/contracts/cluster';
import { and, eq, type SQL } from 'drizzle-orm';
import type { DatabaseSession } from '../database/database';
import { clusterMemberGroups } from '../database/tables/cluster-member-groups';
import { clusterMembers } from '../database/tables/cluster-members';
import { clusters } from '../database/tables/clusters';
import {
  isForeignKeyConstraint,
  isSqliteConstraint,
} from '../database/sqlite-error';
import { ConflictError, InvalidReferenceError } from '../errors/domain-error';

export class ClusterRepository {
  constructor(private readonly db: DatabaseSession) {}

  list(): Cluster[] {
    return this.find();
  }

  get(id: string): Cluster | undefined {
    return this.find(eq(clusters.id, id))[0];
  }

  findByName(name: string): { id: string } | undefined {
    return this.db
      .select({ id: clusters.id })
      .from(clusters)
      .where(eq(clusters.nameKey, name.toLowerCase()))
      .get();
  }

  findHostOwners(hostId: string): string[] {
    return this.db
      .select({ name: clusters.name })
      .from(clusters)
      .innerJoin(clusterMembers, eq(clusterMembers.clusterId, clusters.id))
      .where(eq(clusterMembers.hostId, hostId))
      .all()
      .map((row) => row.name);
  }

  insert(cluster: Cluster): void {
    const { members, ...fields } = Cluster.parse(cluster);
    this.save(cluster, () => {
      this.db
        .insert(clusters)
        .values({ ...fields, nameKey: fields.name.toLowerCase() })
        .run();
      this.replaceMembers(cluster.id, members);
    });
  }

  update(cluster: Cluster, replaceMembers: boolean): void {
    const { members, ...fields } = Cluster.parse(cluster);
    this.save(cluster, () => {
      this.db
        .update(clusters)
        .set({ ...fields, nameKey: fields.name.toLowerCase() })
        .where(eq(clusters.id, cluster.id))
        .run();
      if (replaceMembers) this.replaceMembers(cluster.id, members);
    });
  }

  delete(id: string): void {
    this.db.delete(clusters).where(eq(clusters.id, id)).run();
  }

  private find(where?: SQL): Cluster[] {
    const rows = this.db
      .select({
        cluster: clusters,
        member: clusterMembers,
        group: clusterMemberGroups,
      })
      .from(clusters)
      .leftJoin(clusterMembers, eq(clusterMembers.clusterId, clusters.id))
      .leftJoin(
        clusterMemberGroups,
        and(
          eq(clusterMemberGroups.clusterId, clusterMembers.clusterId),
          eq(clusterMemberGroups.hostId, clusterMembers.hostId),
        ),
      )
      .where(where)
      .orderBy(clusterMembers.position, clusterMemberGroups.position)
      .all();
    const result = new Map<
      string,
      {
        fields: typeof clusters.$inferSelect;
        members: Map<string, ClusterMember>;
      }
    >();
    for (const { cluster, member, group } of rows) {
      let entry = result.get(cluster.id);
      if (!entry) {
        entry = { fields: cluster, members: new Map() };
        result.set(cluster.id, entry);
      }
      if (member) {
        let value = entry.members.get(member.hostId);
        if (!value) {
          value = { hostId: member.hostId, groups: [] };
          entry.members.set(member.hostId, value);
        }
        if (group) value.groups.push(group.groupName);
      }
    }
    return [...result.values()].map(({ fields, members }) =>
      Cluster.parse({ ...fields, members: [...members.values()] }),
    );
  }

  /** 调用方必须处于写事务中，旧成员和新成员一起回滚或提交。 */
  private replaceMembers(clusterId: string, members: ClusterMember[]): void {
    this.db
      .delete(clusterMembers)
      .where(eq(clusterMembers.clusterId, clusterId))
      .run();
    members.forEach((member, position) => {
      this.db
        .insert(clusterMembers)
        .values({ clusterId, hostId: member.hostId, position })
        .run();
      // 每个成员最多 20 个分组，避免 500 个成员一起插入超出 SQLite 参数数量限制。
      this.db
        .insert(clusterMemberGroups)
        .values(
          member.groups.map((groupName, groupPosition) => ({
            clusterId,
            hostId: member.hostId,
            groupName,
            position: groupPosition,
          })),
        )
        .run();
    });
  }

  private save(cluster: Cluster, operation: () => void): void {
    try {
      operation();
    } catch (error) {
      if (
        isSqliteConstraint(
          error,
          'SQLITE_CONSTRAINT_UNIQUE',
          'clusters.name_key',
        )
      ) {
        throw new ConflictError(`名称 ${cluster.name} 已被其他集群使用`, {
          cause: error,
        });
      }
      if (isForeignKeyConstraint(error)) {
        throw new InvalidReferenceError('集群成员引用的主机不存在', {
          cause: error,
        });
      }
      throw error;
    }
  }
}
