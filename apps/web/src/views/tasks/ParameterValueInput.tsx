import type { TaskParameter } from '@deploy-crab/contracts/task-input';
import { Input, InputNumber, Select } from 'antd';
import { formatParameterValue } from './parameter-editor-model';
import { SecretSelect } from './SecretSelect';

export const ParameterValueInput = ({
  parameter,
  value,
  onChange,
  label,
}: {
  parameter: TaskParameter;
  value: string;
  onChange: (value: string) => void;
  label: string;
}) => {
  if (parameter.secret)
    return <SecretSelect value={value} onChange={onChange} label={label} />;
  if (parameter.options?.length)
    return (
      <Select
        aria-label={label}
        className="w-full"
        value={value || null}
        placeholder="选择一个选项"
        showSearch={{ optionFilterProp: 'label' }}
        options={parameter.options.map((option) => ({
          value: formatParameterValue(parameter.type, option.value),
          label: option.label,
          description: option.description,
        }))}
        optionRender={(option) => (
          <div>
            <div>{option.label}</div>
            {option.data.description && (
              <div className="whitespace-normal text-xs text-sand-9">
                {option.data.description}
              </div>
            )}
          </div>
        )}
        onChange={onChange}
      />
    );
  if (parameter.type === 'boolean')
    return (
      <Select
        aria-label={label}
        className="w-full"
        value={value || null}
        placeholder="请选择"
        options={[
          { value: 'true', label: '是（true）' },
          { value: 'false', label: '否（false）' },
        ]}
        onChange={onChange}
      />
    );
  if (parameter.type === 'number')
    return (
      <InputNumber
        aria-label={label}
        className="w-full"
        value={value === '' ? null : Number(value)}
        {...(parameter.minimum !== undefined ? { min: parameter.minimum } : {})}
        {...(parameter.maximum !== undefined ? { max: parameter.maximum } : {})}
        onChange={(next) => onChange(next === null ? '' : String(next))}
      />
    );
  if (parameter.type === 'json')
    return (
      <Input.TextArea
        aria-label={label}
        value={value}
        className="font-mono"
        autoSize={{ minRows: 2, maxRows: 8 }}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  return (
    <Input
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
};
