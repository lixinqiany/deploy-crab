import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { clusterMembers } from './cluster-members';

export const clusterMemberGroups = sqliteTable(
  'cluster_member_groups',
  {
    clusterId: text('cluster_id').notNull(),
    hostId: text('host_id').notNull(),
    groupName: text('group_name').notNull(),
    position: integer('position').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.clusterId, table.hostId, table.groupName] }),
    foreignKey({
      columns: [table.clusterId, table.hostId],
      foreignColumns: [clusterMembers.clusterId, clusterMembers.hostId],
    }).onDelete('cascade'),
    uniqueIndex('cluster_member_groups_position_unique').on(
      table.clusterId,
      table.hostId,
      table.position,
    ),
    check('cluster_member_groups_position_check', sql`${table.position} >= 0`),
  ],
);
