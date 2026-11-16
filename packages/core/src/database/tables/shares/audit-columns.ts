import { text } from 'drizzle-orm/sqlite-core';

/** 每张表使用新的列构造器。 */
export const auditColumns = () => ({
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
