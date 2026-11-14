import {
  ConflictError,
  InUseError,
  InvalidReferenceError,
  NotFoundError,
  ValidationError,
} from '@deploy-crab/core/errors/domain-error';
import {
  Controller,
  Get,
  type INestApplication,
  Logger,
  Post,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { MockInstance } from 'vitest';
import { ApiExceptionFilter } from './api-exception.filter';

/** 每个接口抛出一种异常，用来观察过滤器的输出 */
@Controller()
class ThrowingController {
  @Get('validation')
  validation() {
    throw new ValidationError('请求参数不合法', [
      { path: ['name'], message: '名称不能为空' },
    ]);
  }

  @Get('not-found')
  notFound() {
    throw new NotFoundError('主机 web-1 不存在');
  }

  @Get('conflict')
  conflict() {
    throw new ConflictError('名称 web-1 已被使用');
  }

  @Get('invalid-reference')
  invalidReference() {
    throw new InvalidReferenceError('跳板主机不能是自己');
  }

  @Get('in-use')
  inUse() {
    throw new InUseError('主机仍被集群 prod 使用');
  }

  @Get('unknown')
  unknown() {
    throw new Error('secret internal detail');
  }

  @Post('json')
  json() {
    return 'ok';
  }
}

describe('ApiExceptionFilter', () => {
  let app: INestApplication<App>;
  let logError: MockInstance<Logger['error']>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ThrowingController],
      providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  beforeEach(() => {
    logError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    logError.mockRestore();
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (path: string) => request(app.getHttpServer()).get(path);

  it('ValidationError → 400，带逐字段问题', async () => {
    const response = await get('/validation').expect(400);
    expect(response.body).toEqual({
      statusCode: 400,
      code: 'validation_failed',
      message: '请求参数不合法',
      issues: [{ path: ['name'], message: '名称不能为空' }],
    });
  });

  it.each([
    ['/not-found', 404, 'not_found', '主机 web-1 不存在'],
    ['/conflict', 409, 'conflict', '名称 web-1 已被使用'],
    ['/invalid-reference', 422, 'invalid_reference', '跳板主机不能是自己'],
    ['/in-use', 409, 'in_use', '主机仍被集群 prod 使用'],
  ])('%s → %i %s', async (path, statusCode, code, message) => {
    const response = await get(path).expect(statusCode);
    expect(response.body).toEqual({ statusCode, code, message });
  });

  it('路由不存在 → 404 not_found', async () => {
    const response = await get('/nowhere').expect(404);
    expect(response.body).toMatchObject({ statusCode: 404, code: 'not_found' });
  });

  it('JSON 格式错误 → 400 bad_request', async () => {
    const response = await request(app.getHttpServer())
      .post('/json')
      .set('Content-Type', 'application/json')
      .send('{ broken')
      .expect(400);
    expect(response.body).toMatchObject({
      statusCode: 400,
      code: 'bad_request',
    });
  });

  it('未知异常 → 500，不暴露内部信息，并记录日志', async () => {
    const response = await get('/unknown').expect(500);
    expect(response.body).toEqual({
      statusCode: 500,
      code: 'internal_error',
      message: '服务器内部错误',
    });
    expect(logError).toHaveBeenCalledOnce();
  });
});
