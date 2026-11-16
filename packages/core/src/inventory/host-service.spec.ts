import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CreateHostInput } from '@deploy-crab/contracts/host';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ConflictError,
  InUseError,
  InvalidReferenceError,
  NotFoundError,
  ValidationError,
} from '../errors/domain-error';
import { Database, DATABASE_FILENAME } from '../database/database';
import { ClusterService } from './cluster-service';
import { HostService } from './host-service';

/** 新建主机的输入，只需要写和测试有关的字段 */
const input = (overrides: Partial<CreateHostInput> = {}): CreateHostInput => ({
  name: 'web-1',
  publicAddress: '1.2.3.4',
  privateAddress: '10.0.0.1',
  connectVia: 'public',
  port: 22,
  user: 'root',
  auth: { method: 'agent' },
  jumpHostId: null,
  labels: [],
  description: '',
  ...overrides,
});

describe('HostService', () => {
  let root: string;
  let database: Database;
  let hosts: HostService;
  let clusters: ClusterService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'deploy-crab-hosts-'));
    database = new Database(
      join(root, DATABASE_FILENAME),
      fileURLToPath(new URL('../../migrations/', import.meta.url)),
    );
    hosts = new HostService(database);
    clusters = new ClusterService(database);
  });
  afterEach(async () => {
    database.close();
    await rm(root, { recursive: true, force: true });
  });

  describe('create / get / list', () => {
    it('生成 id 和时间戳，可以读回', async () => {
      const host = await hosts.create(input());

      expect(host).toMatchObject({
        name: 'web-1',
        publicAddress: '1.2.3.4',
        connectVia: 'public',
      });
      expect(host.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(host.createdAt).toBe(host.updatedAt);
      expect(await hosts.get(host.id)).toEqual(host);
    });

    it('list 按名称排序', async () => {
      await hosts.create(input({ name: 'b' }));
      await hosts.create(input({ name: 'a' }));

      expect((await hosts.list()).map((host) => host.name)).toEqual(['a', 'b']);
    });

    it('get 不存在的主机抛出 NotFoundError', async () => {
      await expect(
        hosts.get('00000000-0000-4000-8000-000000000000'),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('名称重复（不区分大小写）抛出 ConflictError', async () => {
      await hosts.create(input({ name: 'Web-1' }));
      await expect(
        hosts.create(input({ name: 'web-1' })),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('并发创建同名主机，只有一个成功', async () => {
      const results = await Promise.allSettled([
        hosts.create(input()),
        hosts.create(input()),
      ]);

      expect(results.map((result) => result.status).sort()).toEqual([
        'fulfilled',
        'rejected',
      ]);
      expect(await hosts.list()).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('只修改传入的字段，并更新 updatedAt', async () => {
      const host = await hosts.create(input());
      await new Promise((resolve) => setTimeout(resolve, 5));

      const updated = await hosts.update(host.id, { port: 2222 });

      expect(updated).toMatchObject({ name: 'web-1', port: 2222 });
      expect(updated.createdAt).toBe(host.createdAt);
      expect(updated.updatedAt > host.updatedAt).toBe(true);
    });

    it('保留自己原来的名称不算重复', async () => {
      const host = await hosts.create(input());
      await expect(
        hosts.update(host.id, { name: 'WEB-1' }),
      ).resolves.toMatchObject({ name: 'WEB-1' });
    });

    it('改成其他主机的名称抛出 ConflictError', async () => {
      await hosts.create(input({ name: 'a' }));
      const b = await hosts.create(input({ name: 'b' }));
      await expect(hosts.update(b.id, { name: 'A' })).rejects.toBeInstanceOf(
        ConflictError,
      );
    });

    it('修改不存在的主机抛出 NotFoundError', async () => {
      await expect(
        hosts.update('00000000-0000-4000-8000-000000000000', { port: 1 }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('地址', () => {
    it('合并后选中的地址为空时抛出 ValidationError，并指出字段', async () => {
      const host = await hosts.create(input({ privateAddress: null }));

      const error: unknown = await hosts
        .update(host.id, { connectVia: 'private' })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).issues).toEqual([
        {
          path: ['privateAddress'],
          message: '已选择经内网连接，请填写内网地址',
        },
      ]);
    });

    it('两个地址都清空时抛出 ValidationError', async () => {
      const host = await hosts.create(input());
      await expect(
        hosts.update(host.id, { publicAddress: null, privateAddress: null }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('跳板主机', () => {
    it('可以引用已存在的主机，也可以改回直连', async () => {
      const bastion = await hosts.create(input({ name: 'bastion' }));
      const web = await hosts.create(
        input({ name: 'web', jumpHostId: bastion.id }),
      );
      expect(web.jumpHostId).toBe(bastion.id);

      expect(await hosts.update(web.id, { jumpHostId: null })).toMatchObject({
        jumpHostId: null,
      });
    });

    it('引用不存在的主机抛出 InvalidReferenceError', async () => {
      await expect(
        hosts.create(
          input({ jumpHostId: '00000000-0000-4000-8000-000000000000' }),
        ),
      ).rejects.toBeInstanceOf(InvalidReferenceError);
    });

    it('不能指向自己', async () => {
      const host = await hosts.create(input());
      await expect(
        hosts.update(host.id, { jumpHostId: host.id }),
      ).rejects.toThrow('跳板主机不能是自己');
    });

    it('不能形成环：a → b → a', async () => {
      const a = await hosts.create(input({ name: 'a' }));
      const b = await hosts.create(input({ name: 'b', jumpHostId: a.id }));

      await expect(hosts.update(a.id, { jumpHostId: b.id })).rejects.toThrow(
        '跳板主机不能形成环',
      );
    });
  });

  describe('delete', () => {
    it('删除后读不到', async () => {
      const host = await hosts.create(input());
      await hosts.delete(host.id);
      expect(await hosts.list()).toEqual([]);
    });

    it('仍被当作跳板时抛出 InUseError', async () => {
      const bastion = await hosts.create(input({ name: 'bastion' }));
      await hosts.create(input({ name: 'web', jumpHostId: bastion.id }));

      await expect(hosts.delete(bastion.id)).rejects.toBeInstanceOf(InUseError);
      expect(await hosts.list()).toHaveLength(2);
    });

    it('仍在集群中时抛出 InUseError；从集群移除后可以删除', async () => {
      const web = await hosts.create(input());
      const cluster = await clusters.create({
        name: 'prod',
        description: '',
        members: [{ hostId: web.id, groups: ['web'] }],
      });

      await expect(hosts.delete(web.id)).rejects.toThrow(
        '主机 web-1 仍在集群 prod 中，请先从集群中移除',
      );

      await clusters.update(cluster.id, { members: [] });
      await hosts.delete(web.id);
      expect(await hosts.list()).toEqual([]);
    });

    it('删除不存在的主机抛出 NotFoundError', async () => {
      await expect(
        hosts.delete('00000000-0000-4000-8000-000000000000'),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
