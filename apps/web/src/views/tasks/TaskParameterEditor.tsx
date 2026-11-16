import {
  PARAMETER_TYPES,
  PARAMETER_TYPE_LABELS,
} from '@deploy-crab/contracts/task-input';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Checkbox, Form, Input, Select, Switch } from 'antd';
import {
  parameterDraft,
  parseParameterValue,
  type ParameterDraft,
} from './parameter-editor-model';
import { ParameterConstraintsEditor } from './ParameterConstraintsEditor';

export const TaskParameterEditor = ({
  parameters,
  onChange,
}: {
  parameters: ParameterDraft[];
  onChange: (parameters: ParameterDraft[]) => void;
}) => (
  <section
    className="mb-5 rounded-xl border border-sand-4 bg-sand-2 p-4"
    aria-label="任务参数定义"
  >
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="font-medium text-sand-12">
        任务参数{' '}
        <span className="text-xs text-sand-9">{parameters.length} / 32</span>
      </div>
      <Button
        size="small"
        icon={<PlusOutlined />}
        disabled={parameters.length >= 32}
        onClick={() => onChange([...parameters, parameterDraft()])}
      >
        添加参数
      </Button>
    </div>
    <p className="mt-0 text-xs text-sand-9">
      定义调用者需要填写的字段。必填项必须传值，可选项可以配置默认值；脚本中会收到合并后的参数。
    </p>
    {!parameters.length && (
      <div className="rounded-lg border border-dashed border-sand-4 p-3 text-xs text-sand-9">
        当前任务无需参数。添加字段后，引用此任务时会自动显示输入表单。
      </div>
    )}
    <div className="flex flex-col gap-3">
      {parameters.map((parameter, index) => {
        const update = (patch: Partial<ParameterDraft>) =>
          onChange(
            parameters.map((item) =>
              item.key === parameter.key ? { ...item, ...patch } : item,
            ),
          );
        const parsed = parameter.hasDefault
          ? parseParameterValue(parameter.type, parameter.defaultText)
          : null;
        return (
          <div
            key={parameter.key}
            className="rounded-lg border border-sand-4 bg-sand-1 p-3"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs text-sand-9">参数 {index + 1}</span>
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
                aria-label={`删除参数 ${index + 1}`}
                onClick={() =>
                  onChange(
                    parameters.filter((item) => item.key !== parameter.key),
                  )
                }
              />
            </div>
            <div className="grid gap-x-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_120px_100px]">
              <Form.Item label="参数名">
                <Input
                  aria-label={`参数名 ${index + 1}`}
                  placeholder="例如 mirrorUrl"
                  maxLength={64}
                  value={parameter.name}
                  onChange={(event) => update({ name: event.target.value })}
                />
              </Form.Item>
              <Form.Item label="显示名称">
                <Input
                  aria-label={`参数显示名称 ${index + 1}`}
                  placeholder="例如 镜像源地址"
                  maxLength={64}
                  value={parameter.title}
                  onChange={(event) => update({ title: event.target.value })}
                />
              </Form.Item>
              <Form.Item label="类型">
                <Select
                  aria-label={`参数类型 ${index + 1}`}
                  value={parameter.type}
                  options={PARAMETER_TYPES.map((type) => ({
                    value: type,
                    label: PARAMETER_TYPE_LABELS[type],
                  }))}
                  onChange={(type: ParameterDraft['type']) =>
                    update({
                      type,
                      hasDefault: false,
                      defaultText: '',
                      choices: [],
                      minimum: undefined,
                      maximum: undefined,
                      secret: false,
                      targetFields: undefined,
                    })
                  }
                />
              </Form.Item>
              <Form.Item label="是否必填">
                <Switch
                  aria-label={`参数必填 ${index + 1}`}
                  checked={parameter.required}
                  checkedChildren="必填"
                  unCheckedChildren="可选"
                  onChange={(required) =>
                    update({
                      required,
                      ...(required
                        ? { hasDefault: false, defaultText: '' }
                        : {}),
                    })
                  }
                />
              </Form.Item>
            </div>
            <Form.Item label="填写说明">
              <Input
                aria-label={`参数说明 ${index + 1}`}
                placeholder="告诉调用者这个参数的用途和填写方式"
                maxLength={500}
                value={parameter.description}
                onChange={(event) =>
                  update({ description: event.target.value })
                }
              />
            </Form.Item>
            {parameter.type === 'json' && (
              <>
                <Form.Item
                  label="按执行主机填写"
                  extra="根据 Session 中选中的主机生成字段卡片；脚本收到包含 hostId 的 JSON 数组。"
                >
                  <Switch
                    checked={!!parameter.targetFields?.length}
                    onChange={(enabled) =>
                      update({
                        targetFields: enabled
                          ? [
                              {
                                key: crypto.randomUUID(),
                                name: 'hostname',
                                title: '主机名',
                                type: 'string',
                              },
                            ]
                          : undefined,
                      })
                    }
                  />
                </Form.Item>
                {parameter.targetFields?.map((field, fieldIndex) => (
                  <div
                    key={field.key}
                    className="mb-3 flex flex-wrap gap-2 rounded-lg border border-sand-4 p-3"
                  >
                    <Input
                      className="!w-32"
                      placeholder="字段名"
                      value={field.name}
                      onChange={(event) =>
                        update({
                          targetFields: parameter.targetFields!.map(
                            (item, i) =>
                              i === fieldIndex
                                ? { ...item, name: event.target.value }
                                : item,
                          ),
                        })
                      }
                    />
                    <Input
                      className="!w-36"
                      placeholder="显示名称"
                      value={field.title}
                      onChange={(event) =>
                        update({
                          targetFields: parameter.targetFields!.map(
                            (item, i) =>
                              i === fieldIndex
                                ? { ...item, title: event.target.value }
                                : item,
                          ),
                        })
                      }
                    />
                    <Select
                      value={field.type}
                      options={[
                        { value: 'string', label: '文本' },
                        { value: 'number', label: '数字' },
                      ]}
                      onChange={(type: 'string' | 'number') =>
                        update({
                          targetFields: parameter.targetFields!.map(
                            (item, i) =>
                              i === fieldIndex
                                ? {
                                    key: item.key,
                                    name: item.name,
                                    title: item.title,
                                    type,
                                  }
                                : item,
                          ),
                        })
                      }
                    />
                    <Input
                      className="!w-36"
                      placeholder="默认值（可选）"
                      value={String(field.defaultValue ?? '')}
                      onChange={(event) =>
                        update({
                          targetFields: parameter.targetFields!.map(
                            (item, i) => {
                              if (i !== fieldIndex) return item;
                              const { defaultValue: _default, ...rest } = item;
                              return event.target.value
                                ? {
                                    ...rest,
                                    defaultValue:
                                      item.type === 'number'
                                        ? Number(event.target.value)
                                        : event.target.value,
                                  }
                                : rest;
                            },
                          ),
                        })
                      }
                    />
                    <Button
                      aria-label={`删除主机字段 ${fieldIndex + 1}`}
                      icon={<DeleteOutlined />}
                      onClick={() =>
                        update({
                          targetFields: parameter.targetFields!.filter(
                            (_, i) => i !== fieldIndex,
                          ),
                        })
                      }
                    />
                  </div>
                ))}
                {!!parameter.targetFields?.length && (
                  <Button
                    className="mb-4"
                    size="small"
                    disabled={parameter.targetFields.length >= 8}
                    onClick={() =>
                      update({
                        targetFields: [
                          ...parameter.targetFields!,
                          {
                            key: crypto.randomUUID(),
                            name: '',
                            title: '',
                            type: 'string',
                          },
                        ],
                      })
                    }
                  >
                    添加主机字段
                  </Button>
                )}
              </>
            )}
            {parameter.type === 'string' && (
              <Form.Item
                label="凭据引用"
                extra="开启后，调用者选择已保存的密码或密钥；实际内容仅在 SSH 执行时注入。"
              >
                <Switch
                  checked={parameter.secret ?? false}
                  onChange={(secret) =>
                    update({
                      secret,
                      hasDefault: false,
                      defaultText: '',
                      choices: [],
                    })
                  }
                />
              </Form.Item>
            )}
            {!parameter.secret && (
              <ParameterConstraintsEditor
                parameter={parameter}
                update={update}
              />
            )}
            {!parameter.required && !parameter.secret && (
              <>
                <Checkbox
                  className="mb-2"
                  checked={parameter.hasDefault}
                  onChange={(event) =>
                    update({
                      hasDefault: event.target.checked,
                      defaultText:
                        parameter.type === 'boolean'
                          ? 'false'
                          : parameter.defaultText,
                    })
                  }
                >
                  设置默认值
                </Checkbox>
                {parameter.hasDefault && (
                  <Form.Item
                    className="mb-0"
                    validateStatus={parsed?.error ? 'error' : ''}
                    help={parsed?.error}
                  >
                    {parameter.type === 'boolean' ? (
                      <Select
                        aria-label={`参数默认值 ${index + 1}`}
                        value={parameter.defaultText}
                        options={[
                          { value: 'true', label: '是（true）' },
                          { value: 'false', label: '否（false）' },
                        ]}
                        onChange={(defaultText: string) =>
                          update({ defaultText })
                        }
                      />
                    ) : parameter.type === 'json' ? (
                      <Input.TextArea
                        aria-label={`参数默认值 ${index + 1}`}
                        autoSize={{ minRows: 2, maxRows: 6 }}
                        className="font-mono text-xs"
                        placeholder="例如 [] 或 {}"
                        value={parameter.defaultText}
                        onChange={(event) =>
                          update({ defaultText: event.target.value })
                        }
                      />
                    ) : (
                      <Input
                        aria-label={`参数默认值 ${index + 1}`}
                        placeholder="未传入时使用这个值"
                        value={parameter.defaultText}
                        onChange={(event) =>
                          update({ defaultText: event.target.value })
                        }
                      />
                    )}
                  </Form.Item>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  </section>
);
