import { randomUUID } from 'node:crypto';
import {
  TASK_ACTIONS,
  taskReferences,
  type CreateTaskInput,
  type Task,
  type TaskCatalog,
  type UpdateTaskInput,
} from '@deploy-crab/contracts/task';
import type { Database } from '../database/database';
import {
  ConflictError,
  InUseError,
  InvalidReferenceError,
  NotFoundError,
} from '../errors/domain-error';
import { TaskRepository } from './task-repository';

/** 只管理可复用的任务定义；创建、编辑和删除均不会派发执行。 */
export class TaskService {
  constructor(private readonly database: Database) {}
  catalog(): TaskCatalog {
    return structuredClone({
      actions: TASK_ACTIONS,
      templates: [],
    });
  }
  list(): Task[] {
    return this.database
      .read((tx) => new TaskRepository(tx).list())
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  get(id: string): Task {
    return this.database.read((tx) =>
      this.requireTask(new TaskRepository(tx), id),
    );
  }
  create(input: CreateTaskInput): Task {
    return this.database.write((tx) => {
      const repository = new TaskRepository(tx),
        now = new Date().toISOString();
      const task: Task = {
        ...input,
        id: randomUUID(),
        revision: 1,
        createdAt: now,
        updatedAt: now,
      };
      this.validate(task, repository);
      repository.save(task, 'insert');
      return task;
    });
  }
  update(id: string, input: UpdateTaskInput): Task {
    return this.database.write((tx) => {
      const repository = new TaskRepository(tx),
        current = this.requireTask(repository, id);
      if (current.revision !== input.revision)
        throw new ConflictError('任务已在其他窗口更新，请重新打开后再编辑');
      const task: Task = {
        ...current,
        ...input,
        revision: current.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      this.validate(task, repository);
      repository.save(task, 'update');
      return task;
    });
  }
  delete(id: string): void {
    this.database.write((tx) => {
      const repository = new TaskRepository(tx),
        task = this.requireTask(repository, id);
      const owners = repository.owners(id);
      if (owners.length)
        throw new InUseError(
          `任务「${task.name}」被 ${owners.join('、')} 引用，请先移除引用`,
        );
      repository.delete(id);
    });
  }
  private requireTask(repository: TaskRepository, id: string): Task {
    const task = repository.get(id);
    if (!task) throw new NotFoundError('任务不存在或已被删除');
    return task;
  }
  private validate(task: Task, repository: TaskRepository): void {
    const duplicate = repository.findByName(task.name);
    if (duplicate && duplicate.id !== task.id)
      throw new ConflictError(`名称 ${task.name} 已被其他任务使用`);
    const references = taskReferences(task.definition);
    const edges = new Map<string, string[]>();
    for (const edge of repository.edges())
      edges.set(edge.taskId, [
        ...(edges.get(edge.taskId) ?? []),
        edge.referencedTaskId,
      ]);
    edges.set(task.id, references);
    for (const id of references) {
      if (id === task.id) throw new InvalidReferenceError('任务不能引用自己');
      if (!repository.get(id))
        throw new InvalidReferenceError('引用的任务不存在或已被删除');
    }
    const visiting = new Set<string>(),
      visited = new Set<string>();
    const visit = (id: string) => {
      if (visiting.has(id))
        throw new InvalidReferenceError(
          '任务引用不能形成循环（包括步骤和钩子中的引用）',
        );
      if (visited.has(id)) return;
      visiting.add(id);
      for (const child of edges.get(id) ?? []) visit(child);
      visiting.delete(id);
      visited.add(id);
    };
    visit(task.id);
  }
}
