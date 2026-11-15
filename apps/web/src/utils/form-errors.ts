import type { ApiErrorIssue } from '@deploy-crab/contracts/error';
import type { FormInstance } from 'antd';
import { ApiRequestError } from '../api/http';

/**
 * 把保存失败的错误显示到表单上：
 * 校验失败时逐字段标红；其他错误（名称重复等）返回 message 由调用方展示。
 *
 * `fieldPath` 用来把服务端路径换成表单字段路径，
 * 例如集群成员的 `['members', 0, 'groups']`。
 */
export const applyServerErrors = (
  form: FormInstance,
  error: unknown,
  fieldPath: (issue: ApiErrorIssue) => (string | number)[] = (issue) =>
    issue.path,
): string | null => {
  const apiError = ApiRequestError.from(error);

  if (apiError.code === 'validation_failed' && apiError.issues.length > 0) {
    form.setFields(
      apiError.issues.map((issue) => ({
        name: fieldPath(issue),
        errors: [issue.message],
      })),
    );
    return null;
  }

  // 名称重复直接标在名称输入框下面，比弹提示更清楚
  if (apiError.code === 'conflict') {
    form.setFields([{ name: 'name', errors: [apiError.message] }]);
    return null;
  }

  return apiError.message;
};
