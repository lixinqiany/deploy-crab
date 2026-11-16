import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { clusters } from './clusters';
import { hosts } from './hosts';

export const clusterMembers = sqliteTable(
  'cluster_members',
  {
    clusterId: text('cluster_id')
      .notNull()
      .references(() => clusters.id, { onDelete: 'cascade' }),
    hostId: text('host_id')
      .notNull()
      .references(() => hosts.id, { onDelete: 'restrict' }),
    position: integer('position').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.clusterId, table.hostId] }),
    uniqueIndex('cluster_members_position_unique').on(
      table.clusterId,
      table.position,
    ),
    index('cluster_members_host_id_idx').on(table.hostId),
    check('cluster_members_position_check', sql`${table.position} >= 0`),
  ],
);
