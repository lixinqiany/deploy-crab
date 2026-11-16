import { Button, Form, Input, InputNumber, Select } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { ParameterDraft } from './parameter-editor-model';

export const ParameterConstraintsEditor = ({
  parameter,
  update,
}: {
  parameter: ParameterDraft;
  update: (patch: Partial<ParameterDraft>) => void;
}) => {
  const choices = parameter.choices ?? [];
  return (
    <>
      {parameter.type !== 'json' && (
        <>
          <Form.Item label="填写方式">
            <Select
              value={choices.length ? 'select' : 'input'}
              options={[
                { value: 'input', label: '自由填写' },
                { value: 'select', label: '下拉选择' },
              ]}
              onChange={(mode) =>
                update({
                  choices:
                    mode === 'select'
                      ? [
                          {
                            key: crypto.randomUUID(),
                            value: '',
                            label: '',
                            description: '',
                          },
                        ]
                      : [],
                })
              }
            />
          </Form.Item>
          {!!choices.length && (
            <div className="mb-4 rounded-lg border border-sand-4 p-3">
              <p className="mt-0 text-xs text-sand-9">
                值传给脚本，名称和说明展示给调用者。可说明版本支持的系统和使用前提。
              </p>
              {choices.map((choice, index) => (
                <div key={choice.key} className="mb-3 rounded-lg bg-sand-2 p-3">
                  <div className="mb-2 flex gap-2">
                    <Input
                      aria-label={`选项 ${index + 1} 值`}
                      placeholder="传入值，例如 9.0"
                      value={choice.value}
                      onChange={(event) =>
                        update({
                          choices: choices.map((item, i) =>
                            i === index
                              ? { ...item, value: event.target.value }
                              : item,
                          ),
                        })
                      }
                    />
                    <Input
                      aria-label={`选项 ${index + 1} 名称`}
                      placeholder="显示名称"
                      value={choice.label}
                      onChange={(event) =>
                        update({
                          choices: choices.map((item, i) =>
                            i === index
                              ? { ...item, label: event.target.value }
                              : item,
                          ),
                        })
                      }
                    />
                    <Button
                      aria-label={`删除选项 ${index + 1}`}
                      icon={<DeleteOutlined />}
                      onClick={() =>
                        update({
                          choices: choices.filter((_, i) => i !== index),
                        })
                      }
                    />
                  </div>
                  <Input
                    aria-label={`选项 ${index + 1} 说明`}
                    placeholder="例如 支持 Ubuntu 26.04、24.04、22.04"
                    value={choice.description}
                    onChange={(event) =>
                      update({
                        choices: choices.map((item, i) =>
                          i === index
                            ? { ...item, description: event.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                </div>
              ))}
              <Button
                size="small"
                icon={<PlusOutlined />}
                disabled={choices.length >= 64}
                onClick={() =>
                  update({
                    choices: [
                      ...choices,
                      {
                        key: crypto.randomUUID(),
                        value: '',
                        label: '',
                        description: '',
                      },
                    ],
                  })
                }
              >
                添加选项
              </Button>
            </div>
          )}
        </>
      )}
      {parameter.type === 'number' && (
        <div className="grid grid-cols-2 gap-3">
          <Form.Item label="最小值">
            <InputNumber<number>
              className="w-full"
              value={parameter.minimum ?? null}
              onChange={(value) => update({ minimum: value ?? undefined })}
            />
          </Form.Item>
          <Form.Item label="最大值">
            <InputNumber<number>
              className="w-full"
              value={parameter.maximum ?? null}
              onChange={(value) => update({ maximum: value ?? undefined })}
            />
          </Form.Item>
        </div>
      )}
    </>
  );
};
