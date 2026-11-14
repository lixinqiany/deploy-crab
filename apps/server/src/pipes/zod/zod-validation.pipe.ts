import type { ApiError, ApiErrorIssue } from '@deploy-crab/contracts/error';
import {
  type ArgumentMetadata,
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import type { z } from 'zod';
import { isZodDto } from '../../utils/zod-dto';

/**
 * 全局校验 pipe：参数类型是 `ZodDto` 的子类时，用它的 schema 校验并转换参数。
 *
 * - 校验通过：返回 schema 解析后的数据（已去掉多余字段、补上默认值）；
 * - 校验失败：返回 400，响应体符合 contracts 中的 `ApiError`，逐字段列出问题。
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, { metatype }: ArgumentMetadata): unknown {
    if (!isZodDto(metatype)) return value;

    const result = metatype.schema.safeParse(value);
    if (result.success) return result.data;

    const body: ApiError = {
      statusCode: 400,
      code: 'validation_failed',
      message: '请求参数不合法',
      issues: result.error.issues.map((issue) => this.toApiIssue(issue)),
    };
    throw new BadRequestException(body);
  }

  private toApiIssue(issue: z.core.$ZodIssue): ApiErrorIssue {
    return {
      // zod 的路径可能含 symbol，响应里只保留字符串和数字
      path: issue.path.map((key) =>
        typeof key === 'symbol' ? String(key) : key,
      ),
      message: issue.message,
    };
  }
}
