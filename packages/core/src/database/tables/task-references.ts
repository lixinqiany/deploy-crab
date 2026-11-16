import { sql } from 'drizzle-orm';
import {
  check,
  index,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import { tasks } from './tasks';

export const taskReferences = sqliteTable(
  'task_references',
  {
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    referencedTaskId: text('referenced_task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'restrict' }),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.referencedTaskId] }),
    index('task_references_target_idx').on(table.referencedTaskId),
    check(
      'task_references_self_check',
      sql`${table.taskId} <> ${table.referencedTaskId}`,
    ),
  ],
);
