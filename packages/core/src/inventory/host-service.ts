/* eslint-disable @typescript-eslint/require-await -- 保留 Service 的 Promise 契约，将同步存储异常转换为 rejection。 */
import { randomUUID } from 'node:crypto';
import type { CheckHostInput } from '@deploy-crab/contracts/connection';
import type { Run } from '@deploy-crab/contracts/execution';
import {
  type CreateHostInput,
  type Host,
  hostAddressIssues,
  type UpdateHostInput,
} from '@deploy-crab/contracts/host';
import type { Database } from '../database/database';
import type { ExecutionService } from '../execution/execution-service';
import type { ConnectionResolver } from '../ssh/connection-resolver';
import { hostCheckTask } from '../tasks/host-check';
import {
  ConflictError,
  InUseError,
  InvalidReferenceError,
  NotFoundError,
  ValidationError,
} from '../errors/domain-error';
import { definedFields } from '../utils/defined-fields';
import { ClusterRepository } from './cluster-repository';
import { HostRepository } from './host-repository';

/** 主机业务入口，不依赖 Nest。资产修改在事务内完成，SSH 检查派发给执行内核。 */
export class HostService {
  constructor(
    private readonly database: Database,
    private readonly resolver: ConnectionResolver,
    private readonly execution: ExecutionService,
  ) {}

  /** 检查当前连接草稿，无需先保存主机或创建 Session。 */
  async checkConnection(input: CheckHostInput): Promise<Run> {
    return this.execution.submit(
      hostCheckTask.plan(this.resolver.resolve(input)),
      {
        sessionId: null,
        source: 'host-form',
      },
    );
  }

  async list(): Promise<Host[]> {
    return this.database
      .read((tx) => new HostRepository(tx).list())
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(id: string): Promise<Host> {
    return this.database.read((tx) =>
      this.requireHost(new HostRepository(tx), id),
    );
  }

  async create(input: CreateHostInput): Promise<Host> {
    return this.database.write((tx) => {
      const hosts = new HostRepository(tx);
      const now = new Date().toISOString();
      const host: Host = {
        ...input,
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
      };
      this.assertValid(host, hosts);
      hosts.insert(host);
      return host;
    });
  }

  async update(id: string, input: UpdateHostInput): Promise<Host> {
    return this.database.write((tx) => {
      const hosts = new HostRepository(tx);
      const host: Host = {
        ...this.requireHost(hosts, id),
        ...definedFields(input),
        updatedAt: new Date().toISOString(),
      };
      this.assertValid(host, hosts);
      hosts.update(host);
      return host;
    });
  }

  async delete(id: string): Promise<void> {
    this.database.write((tx) => {
      const hosts = new HostRepository(tx);
      const host = this.requireHost(hosts, id);
      const dependents = hosts.findJumpDependents(id);
      if (dependents.length > 0) {
        throw new InUseError(
          `主机 ${host.name} 仍是 ${dependents.join('、')} 的跳板主机，不能删除`,
        );
      }
      const owners = new ClusterRepository(tx).findHostOwners(id);
      if (owners.length > 0) {
        throw new InUseError(
          `主机 ${host.name} 仍在集群 ${owners.join('、')} 中，请先从集群中移除`,
        );
      }
      hosts.delete(host);
    });
  }

  private requireHost(hosts: HostRepository, id: string): Host {
    const host = hosts.get(id);
    if (!host) throw new NotFoundError(`主机 ${id} 不存在`);
    return host;
  }

  private assertValid(host: Host, hosts: HostRepository): void {
    const issues = hostAddressIssues(host);
    if (issues.length > 0) throw new ValidationError('请求参数不合法', issues);
    const duplicate = hosts.findByName(host.name);
    if (duplicate && duplicate.id !== host.id) {
      throw new ConflictError(`名称 ${host.name} 已被其他主机使用`);
    }
    this.assertValidJumpHost(host, hosts);
  }

  private assertValidJumpHost(host: Host, hosts: HostRepository): void {
    if (host.jumpHostId === host.id) {
      throw new InvalidReferenceError('跳板主机不能是自己');
    }
    const visited = new Set([host.id]);
    let currentId = host.jumpHostId;
    while (currentId !== null) {
      if (visited.has(currentId)) {
        throw new InvalidReferenceError('跳板主机不能形成环');
      }
      visited.add(currentId);
      const current = hosts.get(currentId);
      if (!current)
        throw new InvalidReferenceError(`跳板主机 ${currentId} 不存在`);
      currentId = current.jumpHostId;
    }
  }
}
