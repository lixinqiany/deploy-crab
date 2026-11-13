import { z } from 'zod';

// 所有接口共用的错误响应格式。

/**
 * 业务错误码。客户端按它分支处理，`message` 只用于展示。
 *
 * - `validation_failed`：请求体或参数不符合契约
 * - `bad_request`：请求本身无法处理，如 JSON 格式错误
 * - `not_found`：资源不存在
 * - `conflict`：与现有数据冲突，如名称重复
 * - `invalid_reference`：引用关系不成立，如跳板指向自己或形成环
 * - `in_use`：资源仍被其他资源依赖，不能删除
 * - `internal_error`：服务器内部错误
 */
export const ErrorCode = z
  .enum([
    'validation_failed',
    'bad_request',
    'not_found',
    'conflict',
    'invalid_reference',
    'in_use',
    'internal_error',
  ])
  .meta({ id: 'ErrorCode' });
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ApiErrorIssue = z
  .object({
    /** 出错字段的路径，如 `['auth', 'keyPath']` */
    path: z.array(z.union([z.string(), z.number()])),
    message: z.string(),
  })
  .meta({ id: 'ApiErrorIssue' });
export type ApiErrorIssue = z.infer<typeof ApiErrorIssue>;

/** 所有失败响应的统一结构。 */
export const ApiError = z
  .object({
    statusCode: z.number().int(),
    code: ErrorCode,
    message: z.string(),
    /** 校验失败时逐字段列出问题 */
    issues: z.array(ApiErrorIssue).optional(),
  })
  .meta({ id: 'ApiError' });
export type ApiError = z.infer<typeof ApiError>;
