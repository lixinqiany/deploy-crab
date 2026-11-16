import {
  ConnectionEndpoint,
  type CheckHostInput,
  type ConnectionTarget,
} from '@deploy-crab/contracts/connection';
import { connectAddress } from '@deploy-crab/contracts/host';
import type { Database } from '../database/database';
import { InvalidReferenceError, ValidationError } from '../errors/domain-error';
import { HostRepository } from '../inventory/host-repository';

/** 一次读取快照内展开跳板；执行过程不再读取可变的主机资料。 */
export class ConnectionResolver {
  constructor(private readonly database: Database) {}

  resolve(input: CheckHostInput): ConnectionTarget {
    return this.database.read((tx) => {
      const hosts = new HostRepository(tx);
      if (input.hostId && !hosts.get(input.hostId))
        throw new InvalidReferenceError('正在编辑的主机已不存在');
      const seen = new Set<string>(input.hostId ? [input.hostId] : []);
      const jumps: ConnectionEndpoint[] = [];
      let id = input.jumpHostId;
      while (id) {
        if (seen.has(id)) throw new InvalidReferenceError('跳板主机不能形成环');
        if (jumps.length >= 16)
          throw new InvalidReferenceError('跳板链最多支持 16 跳');
        seen.add(id);
        const host = hosts.get(id);
        if (!host) throw new InvalidReferenceError('选择的跳板主机不存在');
        const parsed = ConnectionEndpoint.safeParse({
          address: connectAddress(host),
          port: host.port,
          user: host.user,
          auth: host.auth,
        });
        if (!parsed.success)
          throw new ValidationError('跳板连接配置不适用于 SSH 执行', [
            {
              path: ['jumpHostId'],
              message: `跳板「${host.name}」的连接配置需要修正`,
            },
          ]);
        jumps.unshift(parsed.data);
        id = host.jumpHostId;
      }
      return {
        hostId: input.hostId,
        endpoint: ConnectionEndpoint.parse({
          address: connectAddress(input),
          port: input.port,
          user: input.user,
          auth: input.auth,
        }),
        jumps,
      };
    });
  }
}
