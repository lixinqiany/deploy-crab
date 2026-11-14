import type { ApiErrorIssue, ErrorCode } from '@deploy-crab/contracts/error';

/**
 * 业务错误能用的错误码。
 * `bad_request` 和 `internal_error` 描述的是请求或服务器本身的问题，
 * 由 server 的异常过滤器产生，业务代码不会抛出。
 */
export type DomainErrorCode = Exclude<
  ErrorCode,
  'bad_request' | 'internal_error'
>;

/**
 * 业务错误的基类：只描述「发生了什么」，和 HTTP 无关。
 *
 * server 的异常过滤器把它翻译成对应的 HTTP 状态码和 `ApiError` 响应；
 * 以后的 CLI 可以捕获同样的错误，按自己的方式输出。
 *
 * `message` 会直接展示给用户，写成完整的中文句子，例如「主机 web-1 不存在」。
 */
export abstract class DomainError extends Error {
  abstract readonly code: DomainErrorCode;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    // 让错误名是具体子类名，如 NotFoundError，便于日志排查
    this.name = new.target.name;
  }
}

/** 输入不符合规则，`issues` 逐字段列出问题 */
export class ValidationError extends DomainError {
  readonly code = 'validation_failed';

  constructor(
    message: string,
    readonly issues: ApiErrorIssue[],
  ) {
    super(message);
  }
}

/** 资源不存在 */
export class NotFoundError extends DomainError {
  readonly code = 'not_found';
}

/** 与现有数据冲突，如名称重复 */
export class ConflictError extends DomainError {
  readonly code = 'conflict';
}

/** 引用关系不成立，如跳板指向自己、形成环，或引用的资源不存在 */
export class InvalidReferenceError extends DomainError {
  readonly code = 'invalid_reference';
}

/** 资源仍被其他资源依赖，不能删除 */
export class InUseError extends DomainError {
  readonly code = 'in_use';
}
