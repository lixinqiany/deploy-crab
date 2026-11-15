import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CreateClusterInput } from '@deploy-crab/contracts/cluster';
import type { CreateHostInput, Host } from '@deploy-crab/contracts/host';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ConflictError,
  InvalidReferenceError,
  NotFoundError,
} from '../errors/domain-error';
import { FileDocumentStore } from '../storage/file-document-store';
import { ClusterService } from './cluster-service';
import { HostService } from './host-service';

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

const hostInput = (name: string): CreateHostInput => ({
  name,
  publicAddress: '1.2.3.4',
  privateAddress: '10.0.0.1',
  connectVia: 'public',
  port: 22,
  user: 'root',
  auth: { method: 'agent' },
  jumpHostId: null,
  labels: [],
  description: '',
});

const clusterInput = (
  overrides: Partial<CreateClusterInput> = {},
): CreateClusterInput => ({
  name: 'prod',
  description: '',
  members: [],
  ...overrides,
});

describe('ClusterService', () => {
  let root: string;
  let hosts: HostService;
  let clusters: ClusterService;
  let web: Host;
  let box: Host;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'deploy-crab-clusters-'));
    const store = new FileDocumentStore(root);
    hosts = new HostService(store);
    clusters = new ClusterService(store);
    web = await hosts.create(hostInput('web-1'));
    box = await hosts.create(hostInput('box-1'));
  });
  afterEach(() => rm(root, { recursive: true, force: true }));

  describe('create / get / list', () => {
    it('可以先建空集群', async () => {
      const cluster = await clusters.create(clusterInput());

      expect(cluster).toMatchObject({ name: 'prod', members: [] });
      expect(cluster.createdAt).toBe(cluster.updatedAt);
      expect(await clusters.get(cluster.id)).toEqual(cluster);
    });

    it('成员可以属于多个分组', async () => {
      const members = [
        { hostId: web.id, groups: ['web'] },
        { hostId: box.id, groups: ['infra', 'app'] },
      ];
      const cluster = await clusters.create(clusterInput({ members }));

      expect((await clusters.get(cluster.id)).members).toEqual(members);
    });

    it('list 按名称排序', async () => {
      await clusters.create(clusterInput({ name: 'staging' }));
      await clusters.create(clusterInput({ name: 'prod' }));

      expect((await clusters.list()).map((cluster) => cluster.name)).toEqual([
        'prod',
        'staging',
      ]);
    });

    it('get 不存在的集群抛出 NotFoundError', async () => {
      await expect(clusters.get(MISSING_ID)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('名称重复（不区分大小写）抛出 ConflictError', async () => {
      await clusters.create(clusterInput({ name: 'Prod' }));
      await expect(
        clusters.create(clusterInput({ name: 'prod' })),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('引用不存在的主机抛出 InvalidReferenceError', async () => {
      await expect(
        clusters.create(
          clusterInput({
            members: [
              { hostId: web.id, groups: ['web'] },
              { hostId: MISSING_ID, groups: ['web'] },
            ],
          }),
        ),
      ).rejects.toThrow(`主机 ${MISSING_ID} 不存在`);
    });

    it('同一台主机可以加入多个集群，在各集群中分组不同', async () => {
      await clusters.create(
        clusterInput({
          name: 'prod',
          members: [{ hostId: web.id, groups: ['web'] }],
        }),
      );
      await expect(
        clusters.create(
          clusterInput({
            name: 'staging',
            members: [{ hostId: web.id, groups: ['all'] }],
          }),
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('update', () => {
    it('只修改传入的字段，members 整体替换', async () => {
      const cluster = await clusters.create(
        clusterInput({
          description: '生产',
          members: [{ hostId: web.id, groups: ['web'] }],
        }),
      );

      const updated = await clusters.update(cluster.id, {
        members: [{ hostId: box.id, groups: ['infra', 'app'] }],
      });

      expect(updated).toMatchObject({
        name: 'prod',
        description: '生产',
        members: [{ hostId: box.id, groups: ['infra', 'app'] }],
      });
      expect(updated.createdAt).toBe(cluster.createdAt);
    });

    it('保留自己原来的名称不算重复，改成其他集群的名称抛出 ConflictError', async () => {
      const prod = await clusters.create(clusterInput({ name: 'prod' }));
      await clusters.create(clusterInput({ name: 'staging' }));

      await expect(
        clusters.update(prod.id, { name: 'PROD' }),
      ).resolves.toMatchObject({ name: 'PROD' });
      await expect(
        clusters.update(prod.id, { name: 'Staging' }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('改成引用不存在的主机抛出 InvalidReferenceError', async () => {
      const cluster = await clusters.create(clusterInput());
      await expect(
        clusters.update(cluster.id, {
          members: [{ hostId: MISSING_ID, groups: ['web'] }],
        }),
      ).rejects.toBeInstanceOf(InvalidReferenceError);
    });

    it('修改不存在的集群抛出 NotFoundError', async () => {
      await expect(
        clusters.update(MISSING_ID, { description: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('delete', () => {
    it('删除集群不影响主机', async () => {
      const cluster = await clusters.create(
        clusterInput({ members: [{ hostId: web.id, groups: ['web'] }] }),
      );

      await clusters.delete(cluster.id);

      expect(await clusters.list()).toEqual([]);
      expect(await hosts.get(web.id)).toEqual(web);
    });

    it('删除不存在的集群抛出 NotFoundError', async () => {
      await expect(clusters.delete(MISSING_ID)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });
});
