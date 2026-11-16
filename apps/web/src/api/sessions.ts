import type {
  CreateSessionInput,
  ExecuteSessionTask,
  Session,
  SessionSummary,
  SessionRunPage,
  RunTree,
  UpdateSessionInput,
} from '@deploy-crab/contracts/session';
import type { Run } from '@deploy-crab/contracts/execution';
import { http } from './http';

export const sessionsApi = {
  list: async () => (await http.get<SessionSummary[]>('/sessions')).data,
  get: async (id: string) => (await http.get<Session>(`/sessions/${id}`)).data,
  create: async (body: CreateSessionInput) =>
    (await http.post<Session>('/sessions', body)).data,
  update: async (id: string, body: UpdateSessionInput) =>
    (await http.patch<Session>(`/sessions/${id}`, body)).data,
  delete: async (id: string) => {
    await http.delete(`/sessions/${id}`);
  },
  history: async (id: string, before?: string) =>
    (
      await http.get<SessionRunPage>(`/sessions/${id}/runs`, {
        params: before ? { before } : {},
      })
    ).data,
  execute: async (id: string, body: ExecuteSessionTask) =>
    (await http.post<Run[]>(`/sessions/${id}/runs`, body)).data,
  tree: async (id: string) =>
    (await http.get<RunTree>(`/runs/${id}/tree`)).data,
};
