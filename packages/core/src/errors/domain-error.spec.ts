import { describe, expect, it } from 'vitest';
import {
  ConflictError,
  DomainError,
  NotFoundError,
  ValidationError,
} from './domain-error';

describe('DomainError', () => {
  it('子类带有各自的错误码和类名', () => {
    const error = new NotFoundError('主机 web-1 不存在');

    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('not_found');
    expect(error.name).toBe('NotFoundError');
    expect(error.message).toBe('主机 web-1 不存在');
  });

  it('ValidationError 带有逐字段的问题', () => {
    const issues = [{ path: ['name'], message: '名称不能为空' }];
    const error = new ValidationError('请求参数不合法', issues);

    expect(error.code).toBe('validation_failed');
    expect(error.issues).toBe(issues);
  });

  it('可以通过 cause 保留原始错误', () => {
    const cause = new Error('EEXIST');
    expect(new ConflictError('名称重复', { cause }).cause).toBe(cause);
  });
});
