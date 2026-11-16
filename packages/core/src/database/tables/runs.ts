import type { Run } from '@deploy-crab/contracts/execution';
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { ExecutionPlan } from '../../execution/definition';
import { sessions } from './sessions';

export const runs = sqliteTable(
  'runs',
  {
    id: text('id').primaryKey().notNull(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    parentRunId: text('parent_run_id'),
    requestId: text('request_id'),
    status: text('status').notNull(),
    createdAt: text('created_at').notNull(),
    snapshot: text('snapshot', { mode: 'json' }).$type<Run>().notNull(),
    plan: text('plan', { mode: 'json' }).$type<ExecutionPlan>().notNull(),
  },
  (table) => [
    index('runs_session_created_idx').on(
      table.sessionId,
      table.createdAt,
      table.id,
    ),
    index('runs_parent_idx').on(table.parentRunId),
    index('runs_request_idx').on(table.sessionId, table.requestId),
    index('runs_status_idx').on(table.status),
  ],
);
