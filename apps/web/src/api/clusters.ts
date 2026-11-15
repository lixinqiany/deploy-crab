import type {
  Cluster,
  CreateClusterBody,
  UpdateClusterBody,
} from '@deploy-crab/contracts/cluster';
import { http } from './http';

/**
 * 集群接口。失败时抛出 `ApiRequestError`。
 * 写成箭头函数属性，可以直接当回调传递。
 */
export const clustersApi = {
  list: async (): Promise<Cluster[]> => {
    const { data } = await http.get<Cluster[]>('/clusters');
    return data;
  },

  get: async (id: string): Promise<Cluster> => {
    const { data } = await http.get<Cluster>(`/clusters/${id}`);
    return data;
  },

  create: async (body: CreateClusterBody): Promise<Cluster> => {
    const { data } = await http.post<Cluster>('/clusters', body);
    return data;
  },

  /** 传入 `members` 时整体替换成员列表 */
  update: async (id: string, body: UpdateClusterBody): Promise<Cluster> => {
    const { data } = await http.patch<Cluster>(`/clusters/${id}`, body);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await http.delete(`/clusters/${id}`);
  },
};
