import type { Run } from '@deploy-crab/contracts/execution';
import { http } from './http';

export const runsApi = {
  get: async (id: string): Promise<Run> => {
    const { data } = await http.get<Run>(`/runs/${id}`);
    return data;
  },
  cancel: async (id: string): Promise<Run> => {
    const { data } = await http.post<Run>(`/runs/${id}/cancel`);
    return data;
  },
};
