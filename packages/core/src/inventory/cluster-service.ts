import { randomUUID } from 'node:crypto';
import type {
  Cluster,
  CreateClusterInput,
  UpdateClusterInput,
} from '@deploy-crab/contracts/cluster';
import type { Host } from '@deploy-crab/contracts/host';
import {
  ConflictError,
  InvalidReferenceError,
  NotFoundError,
} from '../errors/domain-error';
import type { Collection, DocumentStore } from '../storage/document-store';
import { definedFields } from '../utils/defined-fields';
import { ClusterCollection } from './cluster-collection';
import { HostCollection } from './host-collection';

/**
 * 集群的业务规则，server 和以后的 CLI 共用，不依赖 Nest 或 HTTP。
 *
 * - 名称在全部集群中唯一，不区分大小写；
 * - 成员引用的主机必须存在。
 *
 * 成员的格式（分组名、不重复等）由 contracts 的 schema 保证，这里不再重复检查。
 */
export class ClusterService {
  readonly #clusters: Collection<Cluster>;
  /**
   * 只读，用来检查成员引用的主机是否存在。
   * 直接读集合而不是调用 HostService：两者在同一个 store、同一把锁下，
   * 在 exclusive 里调用另一个也会加锁的服务会互相等待。
   */
  readonly #hosts: Collection<Host>;

  constructor(private readonly store: DocumentStore) {
    this.#clusters = store.collection(ClusterCollection);
    this.#hosts = store.collection(HostCollection);
  }

  /** 全部集群，按名称排序 */
  async list(): Promise<Cluster[]> {
    const clusters = await this.#clusters.list();
    return clusters.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** 集群不存在时抛出 `NotFoundError` */
  async get(id: string): Promise<Cluster> {
    const cluster = await this.#clusters.get(id);
    if (!cluster) throw new NotFoundError(`集群 ${id} 不存在`);
    return cluster;
  }

  async create(input: CreateClusterInput): Promise<Cluster> {
    return this.store.exclusive(async () => {
      const now = new Date().toISOString();
      const cluster: Cluster = {
        ...input,
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
      };
      await this.assertValid(cluster);
      await this.#clusters.put(cluster);
      return cluster;
    });
  }

  /** 只修改传入的字段；传入 `members` 时整体替换成员列表 */
  async update(id: string, input: UpdateClusterInput): Promise<Cluster> {
    return this.store.exclusive(async () => {
      const current = await this.get(id);
      const cluster: Cluster = {
        ...current,
        ...definedFields(input),
        updatedAt: new Date().toISOString(),
      };
      await this.assertValid(cluster);
      await this.#clusters.put(cluster);
      return cluster;
    });
  }

  /** 集群只引用主机，删除集群不影响主机本身 */
  async delete(id: string): Promise<void> {
    await this.store.exclusive(async () => {
      await this.get(id);
      await this.#clusters.delete(id);
    });
  }

  private async assertValid(cluster: Cluster): Promise<void> {
    await this.assertUniqueName(cluster);
    await this.assertMembersExist(cluster);
  }

  private async assertUniqueName(cluster: Cluster): Promise<void> {
    const name = cluster.name.toLowerCase();
    const clusters = await this.#clusters.list();
    const taken = clusters.some(
      (other) => other.id !== cluster.id && other.name.toLowerCase() === name,
    );
    if (taken) {
      throw new ConflictError(`名称 ${cluster.name} 已被其他集群使用`);
    }
  }

  private async assertMembersExist(cluster: Cluster): Promise<void> {
    if (cluster.members.length === 0) return;
    const hostIds = new Set((await this.#hosts.list()).map((host) => host.id));
    const missing = cluster.members
      .map((member) => member.hostId)
      .filter((hostId) => !hostIds.has(hostId));
    if (missing.length > 0) {
      throw new InvalidReferenceError(`主机 ${missing.join('、')} 不存在`);
    }
  }
}
