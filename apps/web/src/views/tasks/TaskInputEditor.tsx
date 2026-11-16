import type { TaskInput } from '@deploy-crab/contracts/task-input';
import type { Task } from '@deploy-crab/contracts/task';
import { Button, Form, Input, Select, Tag } from 'antd';
import { formatParameterValue } from './parameter-editor-model';
import { resolveCallInput, type InputDraft } from './task-input-model';

export const TaskInputEditor = ({
  task,
  input,
  draft,
}: {
  task: Task | undefined;
  input: TaskInput | undefined;
  draft: InputDraft;
}) => {
  if (!task) return null;
  const parameters = task.definition.parameters;
  const resolved = resolveCallInput(parameters, input, draft.fields);
  const unknown = Object.keys(input ?? {}).filter(
    (name) =>
      !parameters.some((p) => p.name === name) && draft.fields[name] !== '',
  );
  if (!parameters.length && !unknown.length)
    return <p className="text-xs text-sand-9">此任务无需填写参数。</p>;
  return (
    <div className="mb-4 rounded-lg border border-sand-4 bg-sand-2 p-3">
      <div className="mb-1 font-medium text-sand-12">传入参数</div>
      <p className="mt-0 text-xs text-sand-9">
        按所选任务的定义填写；可选项留空时使用默认值，没有默认值则不传。
      </p>
      {parameters.map((parameter) => {
        const { name, type, required, defaultValue } = parameter;
        const value =
          draft.fields[name] ??
          (input?.[name] === undefined
            ? ''
            : formatParameterValue(type, input[name]));
        const placeholder =
          defaultValue === undefined
            ? '未设置'
            : `默认：${formatParameterValue(type, defaultValue)}`;
        const error = resolved.errors[name];
        return (
          <Form.Item
            key={name}
            label={
              <span>
                {parameter.title || name}{' '}
                {parameter.title && (
                  <code className="text-xs text-sand-9">{name}</code>
                )}{' '}
                <Tag color={required ? 'orange' : 'default'}>
                  {required ? '必填' : '可选'}
                </Tag>
              </span>
            }
            required={required}
            validateStatus={error ? 'error' : ''}
            help={error}
            extra={parameter.description || undefined}
          >
            {type === 'boolean' ? (
              <Select
                aria-label={`参数 ${name}`}
                value={value || null}
                placeholder={placeholder}
                allowClear
                options={[
                  { value: 'true', label: '是（true）' },
                  { value: 'false', label: '否（false）' },
                ]}
                onChange={(text: string | undefined) =>
                  draft.onChange(name, text ?? '')
                }
              />
            ) : type === 'json' ? (
              <Input.TextArea
                aria-label={`参数 ${name}`}
                value={value}
                placeholder={placeholder}
                className="font-mono text-xs"
                autoSize={{ minRows: 2, maxRows: 8 }}
                onChange={(event) => draft.onChange(name, event.target.value)}
              />
            ) : (
              <Input
                aria-label={`参数 ${name}`}
                value={value}
                placeholder={placeholder}
                inputMode={type === 'number' ? 'decimal' : 'text'}
                onChange={(event) => draft.onChange(name, event.target.value)}
              />
            )}
          </Form.Item>
        );
      })}
      {unknown.map((name) => (
        <div key={name} className="text-xs text-red-600">
          未声明参数：{name}{' '}
          <Button size="small" onClick={() => draft.onChange(name, '')}>
            移除
          </Button>
        </div>
      ))}
      {resolved.errors[''] && (
        <p className="text-xs text-red-600">{resolved.errors['']}</p>
      )}
    </div>
  );
};
