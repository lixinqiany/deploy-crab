import type { SessionDraft } from '@deploy-crab/contracts/session';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { auditColumns } from './shares/audit-columns';

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey().notNull(),
  title: text('title').notNull(),
  draft: text('draft', { mode: 'json' }).$type<SessionDraft>().notNull(),
  revision: integer('revision').notNull(),
  ...auditColumns(),
});
