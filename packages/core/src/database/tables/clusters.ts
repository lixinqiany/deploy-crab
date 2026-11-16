import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { auditColumns } from './shares/audit-columns';

export const clusters = sqliteTable(
  'clusters',
  {
    id: text('id').primaryKey().notNull(),
    name: text('name').notNull(),
    nameKey: text('name_key').notNull(),
    description: text('description').notNull(),
    ...auditColumns(),
  },
  (table) => [uniqueIndex('clusters_name_key_unique').on(table.nameKey)],
);
