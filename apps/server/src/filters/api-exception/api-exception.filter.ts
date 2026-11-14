import type { ApiError } from '@deploy-crab/contracts/error';
import {
  DomainError,
  type DomainErrorCode,
  ValidationError,
} from '@deploy-crab/core/errors/domain-error';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

/** 业务错误码对应的 HTTP 状态码；新增错误码时这里会报类型错误，提醒补上 */
const STATUS_OF: Record<DomainErrorCode, HttpStatus> = {
  validation_failed: HttpStatus.BAD_REQUEST,
  not_found: HttpStatus.NOT_FOUND,
  conflict: HttpStatus.CONFLICT,
  invalid_reference: HttpStatus.UNPROCESSABLE_ENTITY,
  in_use: HttpStatus.CONFLICT,
};

/**
 * 全局异常过滤器：把所有异常都输出成 contracts 中的 `ApiError` 格式。
 *
 * - `DomainError`（业务错误）：按错误码映射状态码，`message` 原样返回；
 * - `HttpException`（Nest 自身产生，如路由不存在、JSON 格式错误）：保留状态码；
 * - 其他未知异常：记录日志，只返回笼统的 500，不把内部细节暴露给客户端。
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  readonly #logger = new Logger(ApiExceptionFilter.name);

  // 通过 HttpAdapterHost 发送响应，不直接依赖 Express
  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const body = this.toApiError(exception);
    const { httpAdapter } = this.adapterHost;
    httpAdapter.reply(host.switchToHttp().getResponse(), body, body.statusCode);
  }

  private toApiError(exception: unknown): ApiError {
    if (exception instanceof DomainError) return this.fromDomain(exception);
    if (exception instanceof HttpException) return this.fromHttp(exception);
    return this.fromUnknown(exception);
  }

  private fromDomain(error: DomainError): ApiError {
    return {
      statusCode: STATUS_OF[error.code],
      code: error.code,
      message: error.message,
      ...(error instanceof ValidationError && { issues: error.issues }),
    };
  }

  private fromHttp(exception: HttpException): ApiError {
    const statusCode = exception.getStatus();
    if (statusCode >= 500) return this.fromUnknown(exception);
    return {
      statusCode,
      code: statusCode === 404 ? 'not_found' : 'bad_request',
      message: exception.message,
    };
  }

  private fromUnknown(exception: unknown): ApiError {
    this.#logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : exception,
    );
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'internal_error',
      message: '服务器内部错误',
    };
  }
}
