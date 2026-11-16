import type {
  CreateHostBody,
  Host,
  UpdateHostBody,
} from '@deploy-crab/contracts/host';
import { http } from './http';
import type { CheckHostBody } from '@deploy-crab/contracts/connection';
import type { Run } from '@deploy-crab/contracts/execution';

/**
 * 主机接口。失败时抛出 `ApiRequestError`。
 * 写成箭头函数属性，可以直接当回调传递（如 `queryFn: hostsApi.list`）。
 */
export const hostsApi = {
  checkConnection: async (body: CheckHostBody): Promise<Run> => {
    const { data } = await http.post<Run>('/hosts/check-connection', body);
    return data;
  },
  list: async (): Promise<Host[]> => {
    const { data } = await http.get<Host[]>('/hosts');
    return data;
  },

  get: async (id: string): Promise<Host> => {
    const { data } = await http.get<Host>(`/hosts/${id}`);
    return data;
  },

  create: async (body: CreateHostBody): Promise<Host> => {
    const { data } = await http.post<Host>('/hosts', body);
    return data;
  },

  update: async (id: string, body: UpdateHostBody): Promise<Host> => {
    const { data } = await http.patch<Host>(`/hosts/${id}`, body);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await http.delete(`/hosts/${id}`);
  },
};
