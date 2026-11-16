/* eslint-disable @typescript-eslint/require-await -- 保留 Service 的 Promise 契约，将同步存储异常转换为 rejection。 */
import { randomUUID } from 'node:crypto';
import type {
  Cluster,
  CreateClusterInput,
  UpdateClusterInput,
} from '@deploy-crab/contracts/cluster';
import type { Database } from '../database/database';
import {
  ConflictError,
  InvalidReferenceError,
  NotFoundError,
} from '../errors/domain-error';
import { definedFields } from '../utils/defined-fields';
import { ClusterRepository } from './cluster-repository';
import { HostRepository } from './host-repository';

/** 集群业务规则。跨主机和集群的查询使用同一个事务，不互相调用 Service。 */
export class ClusterService {
  constructor(private readonly database: Database) {}

  async list(): Promise<Cluster[]> {
    return this.database
      .read((tx) => new ClusterRepository(tx).list())
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(id: string): Promise<Cluster> {
    return this.database.read((tx) =>
      this.requireCluster(new ClusterRepository(tx), id),
    );
  }

  async create(input: CreateClusterInput): Promise<Cluster> {
    return this.database.write((tx) => {
      const clusters = new ClusterRepository(tx);
      const now = new Date().toISOString();
      const cluster: Cluster = {
        ...input,
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
      };
      this.assertValid(cluster, clusters, new HostRepository(tx));
      clusters.insert(cluster);
      return cluster;
    });
  }

  async update(id: string, input: UpdateClusterInput): Promise<Cluster> {
    return this.database.write((tx) => {
      const clusters = new ClusterRepository(tx);
      const cluster: Cluster = {
        ...this.requireCluster(clusters, id),
        ...definedFields(input),
        updatedAt: new Date().toISOString(),
      };
      this.assertValid(cluster, clusters, new HostRepository(tx));
      clusters.update(cluster, input.members !== undefined);
      return cluster;
    });
  }

  async delete(id: string): Promise<void> {
    this.database.write((tx) => {
      const clusters = new ClusterRepository(tx);
      this.requireCluster(clusters, id);
      clusters.delete(id);
    });
  }

  private requireCluster(clusters: ClusterRepository, id: string): Cluster {
    const cluster = clusters.get(id);
    if (!cluster) throw new NotFoundError(`集群 ${id} 不存在`);
    return cluster;
  }

  private assertValid(
    cluster: Cluster,
    clusters: ClusterRepository,
    hosts: HostRepository,
  ): void {
    const duplicate = clusters.findByName(cluster.name);
    if (duplicate && duplicate.id !== cluster.id) {
      throw new ConflictError(`名称 ${cluster.name} 已被其他集群使用`);
    }
    const missing = hosts.findMissingIds(
      cluster.members.map((member) => member.hostId),
    );
    if (missing.length > 0) {
      throw new InvalidReferenceError(`主机 ${missing.join('、')} 不存在`);
    }
  }
}
