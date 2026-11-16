import {
  PARAMETER_TYPE_LABELS,
  type TaskParameter,
} from '@deploy-crab/contracts/task-input';
import {
  canBindTaskParameter,
  type TaskInputMapping,
} from '@deploy-crab/contracts/task-input-bindings';
import type { Task } from '@deploy-crab/contracts/task';
import { Button, Form, Input, Segmented, Select, Tag } from 'antd';
import { formatParameterValue } from './parameter-editor-model';
import {
  inputFieldDraft,
  resolveCallInput,
  type InputDraft,
  type InputFieldDraft,
} from './task-input-model';

export const TaskInputEditor = ({
  task,
  mapping,
  parentParameters,
  draft,
}: {
  task: Task | undefined;
  mapping: TaskInputMapping;
  parentParameters: TaskParameter[];
  draft: InputDraft;
}) => {
  if (!task) return null;
  const parameters = task.definition.parameters;
  const resolved = resolveCallInput(
    parameters,
    mapping,
    draft.fields,
    parentParameters,
  );
  const unknown = [
    ...new Set([
      ...Object.keys(mapping.input ?? {}),
      ...Object.keys(mapping.inputBindings ?? {}),
      ...Object.keys(draft.fields),
    ]),
  ].filter(
    (name) =>
      !parameters.some((p) => p.name === name) &&
      draft.fields[name]?.mode !== 'omit',
  );
  if (!parameters.length && !unknown.length)
    return <p className="text-xs text-sand-9">此任务无需填写参数。</p>;
  return (
    <div className="mb-4 rounded-lg border border-sand-4 bg-sand-2 p-3">
      <div className="mb-1 font-medium text-sand-12">传入参数</div>
      <p className="mt-0 text-xs text-sand-9">
        每个参数可使用子任务默认值、填写固定值，或绑定当前任务的参数，由调用时传入。
      </p>
      {parameters.map((parameter) => {
        const { name, type, required, defaultValue } = parameter;
        const field = draft.fields[name] ?? inputFieldDraft(parameter, mapping);
        const change = (patch: Partial<InputFieldDraft>) =>
          draft.onChange(name, { ...field, ...patch });
        const error = resolved.errors[name];
        const source = parentParameters.find((p) => p.name === field.sourceKey);
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
            <div className="flex flex-col gap-2">
              <Segmented<InputFieldDraft['mode']>
                aria-label={`参数 ${name} 传值方式`}
                block
                value={field.mode}
                options={[
                  { value: 'omit', label: '不传值' },
                  { value: 'value', label: '固定值' },
                  { value: 'binding', label: '绑定当前任务参数' },
                ]}
                onChange={(mode) => change({ mode })}
              />
              {field.mode === 'value' &&
                (type === 'boolean' ? (
                  <Select
                    aria-label={`参数 ${name}`}
                    value={field.text || null}
                    placeholder="请选择布尔值"
                    options={[
                      { value: 'true', label: '是（true）' },
                      { value: 'false', label: '否（false）' },
                    ]}
                    onChange={(text: string) => change({ text })}
                  />
                ) : type === 'json' ? (
                  <Input.TextArea
                    aria-label={`参数 ${name}`}
                    value={field.text}
                    placeholder="请输入 JSON"
                    className="font-mono text-xs"
                    autoSize={{ minRows: 2, maxRows: 8 }}
                    onChange={(event) => change({ text: event.target.value })}
                  />
                ) : (
                  <Input
                    aria-label={`参数 ${name}`}
                    value={field.text}
                    placeholder={
                      type === 'number'
                        ? '请输入数字'
                        : '请输入固定值；空字符串也会传入'
                    }
                    inputMode={type === 'number' ? 'decimal' : 'text'}
                    onChange={(event) => change({ text: event.target.value })}
                  />
                ))}
              {field.mode === 'binding' && (
                <>
                  <Select
                    aria-label={`参数 ${name} 绑定来源`}
                    value={field.sourceKey || null}
                    placeholder="选择当前任务的参数"
                    showSearch={{ optionFilterProp: 'label' }}
                    options={parentParameters.map((p) => ({
                      value: p.name,
                      label: `${p.title ? `${p.title} · ` : ''}${p.name}（${PARAMETER_TYPE_LABELS[p.type]}）`,
                      disabled: !canBindTaskParameter(p, parameter),
                    }))}
                    notFoundContent="请先在任务参数卡中添加参数"
                    onChange={(sourceKey: string) => change({ sourceKey })}
                  />
                  <span className="text-xs text-sand-9">
                    {required &&
                    source &&
                    !source.required &&
                    source.defaultValue === undefined
                      ? '所选参数为可选，但子任务需要此值；实际调用时未提供将校验失败。'
                      : '先解析当前任务的传入值和默认值，再传给子任务；没有值时按子任务的默认值和必填规则处理。'}
                  </span>
                </>
              )}
              {field.mode === 'omit' && !required && (
                <span className="break-all text-xs text-sand-9">
                  {defaultValue === undefined
                    ? '子任务没有默认值，此字段不会传入。'
                    : `使用子任务默认值：${formatParameterValue(type, defaultValue)}`}
                </span>
              )}
            </div>
          </Form.Item>
        );
      })}
      {unknown.map((name) => (
        <div key={name} className="text-xs text-red-600">
          未声明参数：{name}{' '}
          <Button
            size="small"
            onClick={() =>
              draft.onChange(name, { mode: 'omit', text: '', sourceKey: '' })
            }
          >
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
