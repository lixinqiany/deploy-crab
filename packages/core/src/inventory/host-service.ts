import { randomUUID } from 'node:crypto';
import {
  type CreateHostInput,
  Host,
  type UpdateHostInput,
} from '@deploy-crab/contracts/host';
import {
  ConflictError,
  InUseError,
  InvalidReferenceError,
  NotFoundError,
} from '../errors/domain-error';
import type { Collection, DocumentStore } from '../storage/document-store';
import { definedFields } from '../utils/defined-fields';

/**
 * 主机的业务规则，server 和以后的 CLI 共用，不依赖 Nest 或 HTTP。
 *
 * - 名称在全部主机中唯一，不区分大小写；
 * - 跳板主机必须存在，不能是自己，也不能形成环；
 * - 仍被其他主机当作跳板时不能删除。
 *
 * 输入应当已经通过 contracts 中对应 schema 的校验（server 由 pipe 负责）。
 */
export class HostService {
  readonly #hosts: Collection<Host>;

  constructor(private readonly store: DocumentStore) {
    this.#hosts = store.collection('hosts', Host);
  }

  /** 全部主机，按名称排序 */
  async list(): Promise<Host[]> {
    const hosts = await this.#hosts.list();
    return hosts.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** 主机不存在时抛出 `NotFoundError` */
  async get(id: string): Promise<Host> {
    const host = await this.#hosts.get(id);
    if (!host) throw new NotFoundError(`主机 ${id} 不存在`);
    return host;
  }

  async create(input: CreateHostInput): Promise<Host> {
    // 检查和写入放在同一个 exclusive 里，避免两个请求同时通过名称检查
    return this.store.exclusive(async () => {
      const hosts = await this.#hosts.list();
      const now = new Date().toISOString();
      const host: Host = {
        ...input,
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
      };
      this.assertValid(host, hosts);
      await this.#hosts.put(host);
      return host;
    });
  }

  /** 只修改传入的字段 */
  async update(id: string, input: UpdateHostInput): Promise<Host> {
    return this.store.exclusive(async () => {
      const current = await this.get(id);
      const hosts = await this.#hosts.list();
      const host: Host = {
        ...current,
        ...definedFields(input),
        updatedAt: new Date().toISOString(),
      };
      this.assertValid(host, hosts);
      await this.#hosts.put(host);
      return host;
    });
  }

  async delete(id: string): Promise<void> {
    await this.store.exclusive(async () => {
      const host = await this.get(id);
      const hosts = await this.#hosts.list();
      const dependents = hosts.filter((other) => other.jumpHostId === id);
      if (dependents.length > 0) {
        const names = dependents.map((other) => other.name).join('、');
        throw new InUseError(
          `主机 ${host.name} 仍是 ${names} 的跳板主机，不能删除`,
        );
      }
      await this.#hosts.delete(id);
    });
  }

  /** `hosts` 是保存前的全部主机，可能包含 `host` 的旧版本 */
  private assertValid(host: Host, hosts: Host[]): void {
    const others = hosts.filter((other) => other.id !== host.id);
    this.assertUniqueName(host, others);
    this.assertValidJumpHost(host, others);
  }

  private assertUniqueName(host: Host, others: Host[]): void {
    const name = host.name.toLowerCase();
    if (others.some((other) => other.name.toLowerCase() === name)) {
      throw new ConflictError(`名称 ${host.name} 已被其他主机使用`);
    }
  }

  private assertValidJumpHost(host: Host, others: Host[]): void {
    if (host.jumpHostId === null) return;
    if (host.jumpHostId === host.id) {
      throw new InvalidReferenceError('跳板主机不能是自己');
    }

    const byId = new Map(others.map((other) => [other.id, other]));
    // 沿着跳板链往上走：走回自己就是环
    const visited = new Set<string>();
    let currentId: string | null = host.jumpHostId;
    while (currentId !== null) {
      if (currentId === host.id) {
        throw new InvalidReferenceError('跳板主机不能形成环');
      }
      const current = byId.get(currentId);
      if (!current) {
        throw new InvalidReferenceError(`跳板主机 ${currentId} 不存在`);
      }
      // 已有数据本身有环（例如被手工改过）时停下，不影响这次修改
      if (visited.has(currentId)) return;
      visited.add(currentId);
      currentId = current.jumpHostId;
    }
  }
}
