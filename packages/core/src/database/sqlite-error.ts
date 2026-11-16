/** Drizzle 可能包装驱动错误，沿 cause 查找，其他故障保持原样上抛。 */
export function isSqliteConstraint(
  error: unknown,
  code: string,
  detail?: string,
): boolean {
  let current = error;
  while (current instanceof Error) {
    if ('code' in current && current.code === code) {
      return detail === undefined || current.message.includes(detail);
    }
    current = current.cause;
  }
  return false;
}

/** SQLite 的 ON DELETE RESTRICT 可能以内部触发器错误报告外键失败。 */
export function isForeignKeyConstraint(error: unknown): boolean {
  return (
    isSqliteConstraint(error, 'SQLITE_CONSTRAINT_FOREIGNKEY') ||
    isSqliteConstraint(
      error,
      'SQLITE_CONSTRAINT_TRIGGER',
      'FOREIGN KEY constraint failed',
    )
  );
}
