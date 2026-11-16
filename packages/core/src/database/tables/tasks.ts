import type { TaskDefinition } from '@deploy-crab/contracts/task';
import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { auditColumns } from './shares/audit-columns';

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey().notNull(),
    name: text('name').notNull(),
    nameKey: text('name_key').notNull(),
    description: text('description').notNull(),
    labels: text('labels', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default([]),
    sourceUrl: text('source_url'),
    definition: text('definition', { mode: 'json' })
      .$type<TaskDefinition>()
      .notNull(),
    revision: integer('revision').notNull(),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex('tasks_name_key_unique').on(table.nameKey),
    check('tasks_definition_json_check', sql`json_valid(${table.definition})`),
    check('tasks_revision_check', sql`${table.revision} > 0`),
  ],
);
