import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Cluster } from '@deploy-crab/contracts/cluster';
import type { Host } from '@deploy-crab/contracts/host';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '@/app.module';

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('Clusters (e2e)', () => {
  let app: INestApplication<App>;
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await mkdtemp(join(tmpdir(), 'deploy-crab-clusters-e2e-'));
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot({ dataDirectory })],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    await rm(dataDirectory, { recursive: true, force: true });
  });

  const http = () => request(app.getHttpServer());

  const createHost = async (name: string): Promise<Host> => {
    const response = await http()
      .post('/hosts')
      .send({ name, publicAddress: '10.0.0.1', user: 'root' })
      .expect(201);
    return response.body as Host;
  };

  const createCluster = async (body: object): Promise<Cluster> => {
    const response = await http().post('/clusters').send(body).expect(201);
    return response.body as Cluster;
  };

  it('完整的增删改查流程', async () => {
    const web = await createHost('web-1');
    const box = await createHost('box-1');

    // 新建：只传名称，得到空集群
    const cluster = await createCluster({ name: ' prod ' });
    expect(cluster).toMatchObject({
      name: 'prod',
      description: '',
      members: [],
    });

    await http()
      .get('/clusters')
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([cluster]);
      });
    await http().get(`/clusters/${cluster.id}`).expect(200, cluster);

    // 修改：整体替换成员，一台主机可以属于多个分组
    const members = [
      { hostId: web.id, groups: ['web'] },
      { hostId: box.id, groups: ['infra', 'app'] },
    ];
    const updated = await http()
      .patch(`/clusters/${cluster.id}`)
      .send({ members })
      .expect(200);
    expect(updated.body).toMatchObject({ name: 'prod', members });

    // 删除集群，主机仍在
    await http().delete(`/clusters/${cluster.id}`).expect(204);
    await http().get(`/clusters/${cluster.id}`).expect(404);
    await http().get(`/hosts/${web.id}`).expect(200);
  });

  it('请求体不合法 → 400，逐字段列出问题', async () => {
    const web = await createHost('web-1');

    const response = await http()
      .post('/clusters')
      .send({
        name: 'prod',
        members: [{ hostId: web.id, groups: ['Web App'] }],
      })
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'validation_failed',
      issues: [
        {
          path: ['members', 0, 'groups', 0],
          message: '分组只能包含小写字母、数字和 -，且不能以 - 开头或结尾',
        },
      ],
    });
  });

  it('路径中的 id 不是 UUID → 400', async () => {
    const response = await http().get('/clusters/not-a-uuid').expect(400);
    expect(response.body).toMatchObject({ code: 'validation_failed' });
  });

  it('业务规则错误按错误码返回', async () => {
    await createCluster({ name: 'prod' });

    await http()
      .post('/clusters')
      .send({ name: 'PROD' })
      .expect(409)
      .expect((response) => {
        expect(response.body).toMatchObject({ code: 'conflict' });
      });

    await http()
      .post('/clusters')
      .send({
        name: 'staging',
        members: [{ hostId: MISSING_ID, groups: ['web'] }],
      })
      .expect(422)
      .expect((response) => {
        expect(response.body).toMatchObject({ code: 'invalid_reference' });
      });

    await http().get(`/clusters/${MISSING_ID}`).expect(404);
  });

  it('主机仍在集群中时不能删除 → 409 in_use', async () => {
    const web = await createHost('web-1');
    await createCluster({
      name: 'prod',
      members: [{ hostId: web.id, groups: ['web'] }],
    });

    const response = await http().delete(`/hosts/${web.id}`).expect(409);
    expect(response.body).toEqual({
      statusCode: 409,
      code: 'in_use',
      message: '主机 web-1 仍在集群 prod 中，请先从集群中移除',
    });
  });
});
