import type {
  Cluster,
  CreateClusterBody,
  UpdateClusterBody,
} from '@deploy-crab/contracts/cluster';
import type {
  CreateHostBody,
  Host,
  UpdateHostBody,
} from '@deploy-crab/contracts/host';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { clustersApi } from '@/api/clusters';
import { hostsApi } from '@/api/hosts';
import { queryKeys } from '@/api/query-client';

export const useHosts = () =>
  useQuery({ queryKey: queryKeys.hosts, queryFn: hostsApi.list });

export const useClusters = () =>
  useQuery({ queryKey: queryKeys.clusters, queryFn: clustersApi.list });

/**
 * 主机和集群互相引用，任何一边变化后两边都重新请求，
 * 避免主机页的「所属集群」或集群页的主机信息过期。
 */
const useInvalidateInventory = () => {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.hosts }),
      queryClient.invalidateQueries({ queryKey: queryKeys.clusters }),
    ]);
};

export const useSaveHost = () => {
  const invalidate = useInvalidateInventory();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: CreateHostBody }) =>
      id
        ? hostsApi.update(id, body satisfies UpdateHostBody)
        : hostsApi.create(body),
    onSuccess: invalidate,
  });
};

export const useDeleteHost = () => {
  const invalidate = useInvalidateInventory();
  return useMutation({ mutationFn: hostsApi.delete, onSuccess: invalidate });
};

export const useSaveCluster = () => {
  const invalidate = useInvalidateInventory();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: CreateClusterBody }) =>
      id
        ? clustersApi.update(id, body satisfies UpdateClusterBody)
        : clustersApi.create(body),
    onSuccess: invalidate,
  });
};

export const useDeleteCluster = () => {
  const invalidate = useInvalidateInventory();
  return useMutation({
    mutationFn: clustersApi.delete,
    onSuccess: invalidate,
  });
};

/** 按 id 查找主机，以及每台主机所属的集群 */
export const useInventoryIndex = (hosts: Host[], clusters: Cluster[]) =>
  useMemo(() => {
    const hostById = new Map(hosts.map((host) => [host.id, host]));
    const clustersByHost = new Map<string, Cluster[]>();
    for (const cluster of clusters) {
      for (const { hostId } of cluster.members) {
        const list = clustersByHost.get(hostId) ?? [];
        list.push(cluster);
        clustersByHost.set(hostId, list);
      }
    }
    return { hostById, clustersByHost };
  }, [hosts, clusters]);
