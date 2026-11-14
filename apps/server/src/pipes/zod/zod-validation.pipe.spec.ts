import type { ArgumentMetadata } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { createZodDto } from '../../utils/zod-dto';
import { ZodValidationPipe } from './zod-validation.pipe';

const PersonInput = z.object({
  name: z.string().min(1, '请填写名称'),
  age: z.number({ error: '年龄必须是数字' }).int().default(18),
});

class PersonDto extends createZodDto(PersonInput) {}

const body = (metatype: ArgumentMetadata['metatype']): ArgumentMetadata => ({
  type: 'body',
  metatype,
});

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe();

  it('用 DTO 的 schema 解析参数：补默认值、去掉多余字段', () => {
    expect(
      pipe.transform({ name: 'crab', extra: true }, body(PersonDto)),
    ).toEqual({ name: 'crab', age: 18 });
  });

  it('校验失败时抛出 400，响应体符合 ApiError', () => {
    let error: unknown;
    try {
      pipe.transform({ name: '', age: 'x' }, body(PersonDto));
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual({
      statusCode: 400,
      code: 'validation_failed',
      message: '请求参数不合法',
      issues: [
        { path: ['name'], message: '请填写名称' },
        { path: ['age'], message: '年龄必须是数字' },
      ],
    });
  });

  it('参数类型不是 ZodDto 时原样放行', () => {
    const value = { anything: 1 };
    expect(pipe.transform(value, body(Object))).toBe(value);
    expect(pipe.transform('42', body(String))).toBe('42');
    expect(pipe.transform(value, body(undefined))).toBe(value);
  });
});
