import type { HostAuth } from '@deploy-crab/contracts/host';
import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { auditColumns } from './shares/audit-columns';

export const hosts = sqliteTable(
  'hosts',
  {
    id: text('id').primaryKey().notNull(),
    name: text('name').notNull(),
    // 与业务层的 Unicode toLowerCase 规则一致，不使用 SQLite 的 ASCII NOCASE。
    nameKey: text('name_key').notNull(),
    publicAddress: text('public_address'),
    privateAddress: text('private_address'),
    connectVia: text('connect_via', { enum: ['public', 'private'] }).notNull(),
    port: integer('port').notNull(),
    user: text('user').notNull(),
    auth: text('auth', { mode: 'json' }).$type<HostAuth>().notNull(),
    jumpHostId: text('jump_host_id').references(
      (): AnySQLiteColumn => hosts.id,
      { onDelete: 'restrict' },
    ),
    labels: text('labels', { mode: 'json' }).$type<string[]>().notNull(),
    description: text('description').notNull(),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex('hosts_name_key_unique').on(table.nameKey),
    index('hosts_jump_host_id_idx').on(table.jumpHostId),
    check('hosts_port_check', sql`${table.port} BETWEEN 1 AND 65535`),
    check(
      'hosts_connect_via_check',
      sql`${table.connectVia} IN ('public', 'private')`,
    ),
    check(
      'hosts_address_check',
      sql`(${table.connectVia} = 'public' AND ${table.publicAddress} IS NOT NULL) OR (${table.connectVia} = 'private' AND ${table.privateAddress} IS NOT NULL)`,
    ),
    check(
      'hosts_jump_self_check',
      sql`${table.jumpHostId} IS NULL OR ${table.jumpHostId} <> ${table.id}`,
    ),
    check('hosts_auth_json_check', sql`json_valid(${table.auth})`),
    check('hosts_labels_json_check', sql`json_valid(${table.labels})`),
  ],
);
