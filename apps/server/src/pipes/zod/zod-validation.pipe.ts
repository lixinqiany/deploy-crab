import type { ApiErrorIssue } from '@deploy-crab/contracts/error';
import { ValidationError } from '@deploy-crab/core/errors/domain-error';
import {
  type ArgumentMetadata,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import type { z } from 'zod';
import { isZodDto } from '../../utils/zod-dto';

/**
 * 全局校验 pipe：参数类型是 `ZodDto` 的子类时，用它的 schema 校验并转换参数。
 *
 * - 校验通过：返回 schema 解析后的数据（已去掉多余字段、补上默认值）；
 * - 校验失败：抛出 `ValidationError`，由异常过滤器输出成 400 的 `ApiError`。
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, { metatype }: ArgumentMetadata): unknown {
    if (!isZodDto(metatype)) return value;

    const result = metatype.schema.safeParse(value);
    if (result.success) return result.data;

    throw new ValidationError(
      '请求参数不合法',
      result.error.issues.map((issue) => this.toApiIssue(issue)),
    );
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
