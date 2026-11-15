import { QueryClient } from '@tanstack/react-query';
import { ApiRequestError } from './http';

/**
 * 全局的查询客户端：缓存接口数据，并管理加载、出错、重新请求等状态。
 *
 * - 业务错误（4xx）重试也不会成功，不重试；网络错误重试一次；
 * - 切回浏览器窗口时不自动重新请求，避免编辑中途列表闪动。
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) =>
        failureCount < 1 &&
        !(error instanceof ApiRequestError && error.status >= 400),
    },
  },
});

/** 查询的缓存 key，集中定义，修改数据后按 key 让对应列表失效 */
export const queryKeys = {
  hosts: ['hosts'] as const,
  clusters: ['clusters'] as const,
};
