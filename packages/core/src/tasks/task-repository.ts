import {
  Task,
  taskReferences as referencesOf,
} from '@deploy-crab/contracts/task';
import { eq } from 'drizzle-orm';
import type { DatabaseSession } from '../database/database';
import { tasks } from '../database/tables/tasks';
import { taskReferences } from '../database/tables/task-references';
import { isSqliteConstraint } from '../database/sqlite-error';
import { ConflictError } from '../errors/domain-error';

export class TaskRepository {
  constructor(private readonly db: DatabaseSession) {}
  list(): Task[] {
    return this.db
      .select()
      .from(tasks)
      .all()
      .map((row) => Task.parse(row));
  }
  get(id: string): Task | undefined {
    const row = this.db.select().from(tasks).where(eq(tasks.id, id)).get();
    return row && Task.parse(row);
  }
  findByName(name: string): { id: string } | undefined {
    return this.db
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.nameKey, name.toLowerCase()))
      .get();
  }
  edges(): { taskId: string; referencedTaskId: string }[] {
    return this.db.select().from(taskReferences).all();
  }
  owners(id: string): string[] {
    return this.db
      .select({ name: tasks.name })
      .from(tasks)
      .innerJoin(taskReferences, eq(tasks.id, taskReferences.taskId))
      .where(eq(taskReferences.referencedTaskId, id))
      .all()
      .map((row) => row.name);
  }
  save(task: Task, mode: 'insert' | 'update'): void {
    const fields = { ...Task.parse(task), nameKey: task.name.toLowerCase() };
    try {
      if (mode === 'insert') this.db.insert(tasks).values(fields).run();
      else this.db.update(tasks).set(fields).where(eq(tasks.id, task.id)).run();
      this.db
        .delete(taskReferences)
        .where(eq(taskReferences.taskId, task.id))
        .run();
      for (const referencedTaskId of referencesOf(task.definition))
        this.db
          .insert(taskReferences)
          .values({ taskId: task.id, referencedTaskId })
          .run();
    } catch (error) {
      if (
        isSqliteConstraint(error, 'SQLITE_CONSTRAINT_UNIQUE', 'tasks.name_key')
      )
        throw new ConflictError(`名称 ${task.name} 已被其他任务使用`, {
          cause: error,
        });
      throw error;
    }
  }
  delete(id: string): void {
    this.db.delete(tasks).where(eq(tasks.id, id)).run();
  }
}
