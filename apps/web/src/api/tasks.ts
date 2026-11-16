import type {
  CreateTaskBody,
  Task,
  TaskCatalog,
  UpdateTaskBody,
} from '@deploy-crab/contracts/task';
import { http } from './http';

export const tasksApi = {
  list: async (): Promise<Task[]> => (await http.get<Task[]>('/tasks')).data,
  catalog: async (): Promise<TaskCatalog> =>
    (await http.get<TaskCatalog>('/tasks/catalog')).data,
  create: async (body: CreateTaskBody): Promise<Task> =>
    (await http.post<Task>('/tasks', body)).data,
  update: async (id: string, body: UpdateTaskBody): Promise<Task> =>
    (await http.put<Task>(`/tasks/${id}`, body)).data,
  delete: async (id: string): Promise<void> => {
    await http.delete(`/tasks/${id}`);
  },
};
