import {
  ApiError as ApiErrorBody,
  type ApiErrorIssue,
  type ErrorCode,
} from '@deploy-crab/contracts/error';
import axios, { AxiosError } from 'axios';

/**
 * 接口调用失败时抛出的错误，所有请求函数只会抛出它。
 *
 * - 服务端返回了 `ApiError` 格式的响应：原样带上 `code`、`message`、`issues`；
 * - 网络不通或后端没有启动：归为 `internal_error`，提示无法连接；
 * - 响应格式不对：归为 `internal_error`，带上 HTTP 状态码。
 *
 * 页面按 `code` 分支处理，`message` 可以直接展示给用户。
 */
export class ApiRequestError extends Error {
  override readonly name = 'ApiRequestError';

  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly issues: ApiErrorIssue[] = [],
  ) {
    super(message);
  }

  /** 把 axios 抛出的任何错误转换成 `ApiRequestError` */
  static from(error: unknown): ApiRequestError {
    if (error instanceof ApiRequestError) return error;

    if (error instanceof AxiosError && error.response) {
      const { status } = error.response;
      const data: unknown = error.response.data;
      // 服务端的错误响应应当符合契约
      const body = ApiErrorBody.safeParse(data);
      if (body.success) {
        const { statusCode, code, message, issues } = body.data;
        return new ApiRequestError(statusCode, code, message, issues);
      }
      // 不符合契约：502/503/504 是代理连不上后端（例如后端没有启动）
      if (status >= 502 && status <= 504) {
        return ApiRequestError.unreachable(status);
      }
      return new ApiRequestError(
        status,
        'internal_error',
        `服务器返回了无法识别的错误（HTTP ${status}）`,
      );
    }

    // 没有响应：网络断开、超时等
    return ApiRequestError.unreachable(0);
  }

  private static unreachable(status: number): ApiRequestError {
    return new ApiRequestError(
      status,
      'internal_error',
      '无法连接服务器，请确认后端已经启动',
    );
  }
}

/**
 * 所有接口共用的 axios 实例。开发时 Vite 把 `/api` 转发到后端，
 * 部署时由静态文件服务器代理，所以这里只写相对路径。
 */
export const http = axios.create({
  baseURL: '/api',
  timeout: 15_000,
});

// 统一转换错误：调用方只需要处理 ApiRequestError
http.interceptors.response.use(undefined, (error: unknown) =>
  Promise.reject(ApiRequestError.from(error)),
);
