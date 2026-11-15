import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Host } from '@deploy-crab/contracts/host';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '@/app.module';

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('Hosts (e2e)', () => {
  let app: INestApplication<App>;
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await mkdtemp(join(tmpdir(), 'deploy-crab-hosts-e2e-'));
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

  const createHost = async (body: object): Promise<Host> => {
    const response = await http().post('/hosts').send(body).expect(201);
    return response.body as Host;
  };

  it('完整的增删改查流程', async () => {
    // 新建：只传必填字段，其余使用默认值
    const host = await createHost({
      name: ' web-1 ',
      address: '10.0.0.1',
      user: 'root',
    });
    expect(host).toMatchObject({
      name: 'web-1',
      port: 22,
      auth: { method: 'agent' },
      jumpHostId: null,
      labels: [],
      description: '',
    });

    await http()
      .get('/hosts')
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([host]);
      });
    await http().get(`/hosts/${host.id}`).expect(200, host);

    // 修改：只改传入的字段
    const updated = await http()
      .patch(`/hosts/${host.id}`)
      .send({ port: 2222 })
      .expect(200);
    expect(updated.body).toMatchObject({ name: 'web-1', port: 2222 });

    // 删除
    await http().delete(`/hosts/${host.id}`).expect(204);
    await http().get(`/hosts/${host.id}`).expect(404);
  });

  it('请求体不合法 → 400，逐字段列出问题', async () => {
    const response = await http()
      .post('/hosts')
      .send({ name: '', address: '10.0.0.1', user: 'root', port: 70000 })
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'validation_failed',
      issues: [
        { path: ['name'], message: '名称不能为空' },
        { path: ['port'], message: '端口范围 1–65535' },
      ],
    });
  });

  it('路径中的 id 不是 UUID → 400，不会触及存储', async () => {
    const response = await http().get('/hosts/..%2Fsecret').expect(400);
    expect(response.body).toMatchObject({ code: 'validation_failed' });
  });

  it('业务规则错误按错误码返回', async () => {
    const bastion = await createHost({
      name: 'bastion',
      address: '10.0.0.1',
      user: 'root',
    });
    await createHost({
      name: 'web',
      address: '10.0.0.2',
      user: 'root',
      jumpHostId: bastion.id,
    });

    await http()
      .post('/hosts')
      .send({ name: 'BASTION', address: '10.0.0.3', user: 'root' })
      .expect(409)
      .expect((response) => {
        expect(response.body).toMatchObject({ code: 'conflict' });
      });

    await http()
      .patch(`/hosts/${bastion.id}`)
      .send({ jumpHostId: bastion.id })
      .expect(422)
      .expect((response) => {
        expect(response.body).toMatchObject({ code: 'invalid_reference' });
      });

    await http()
      .delete(`/hosts/${bastion.id}`)
      .expect(409)
      .expect((response) => {
        expect(response.body).toMatchObject({ code: 'in_use' });
      });

    await http().get(`/hosts/${MISSING_ID}`).expect(404);
  });
});
