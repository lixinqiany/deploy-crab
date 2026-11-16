import type { TaskPlacement } from '@deploy-crab/contracts/task-placement';
import type { TaskParameter } from '@deploy-crab/contracts/task-input';
import { Form, Input, Select } from 'antd';

export const TaskPlacementEditor = ({
  value,
  onChange,
  parameters,
  steps,
}: {
  value: TaskPlacement | undefined;
  onChange: (value: TaskPlacement) => void;
  parameters: TaskParameter[];
  steps: { id: string; title: string }[];
}) => (
  <Form.Item
    label="执行位置"
    extra="全部主机执行成功后，此步骤才成功；后续步骤通过依赖等待。主机名单在提交时固定。"
  >
    <Select
      aria-label="步骤执行位置"
      value={value?.kind ?? 'each'}
      options={[
        { value: 'each', label: '全部目标 · 并行执行' },
        { value: 'first', label: '首个目标 · 只执行一次' },
        { value: 'input', label: '由任务参数指定主机' },
        { value: 'result', label: '由前置结果指定主机' },
      ]}
      onChange={(kind: TaskPlacement['kind']) =>
        onChange(
          kind === 'input'
            ? { kind, key: '' }
            : kind === 'result'
              ? { kind, stepId: '', path: [] }
              : { kind },
        )
      }
    />
    {value?.kind === 'input' && (
      <Select
        aria-label="执行主机参数"
        className="mt-2 w-full"
        placeholder="参数应传入本次目标中的主机 ID"
        value={value.key || null}
        options={parameters
          .filter((p) => p.type === 'string')
          .map((p) => ({ value: p.name, label: p.title || p.name }))}
        onChange={(key: string) => onChange({ ...value, key })}
      />
    )}
    {value?.kind === 'result' && (
      <div className="mt-2 flex flex-col gap-2">
        <Select
          aria-label="执行主机结果步骤"
          placeholder="先添加依赖，再选择前置步骤"
          value={value.stepId || null}
          options={steps.map((step) => ({ value: step.id, label: step.title }))}
          onChange={(stepId: string) => onChange({ ...value, stepId })}
        />
        <Input
          aria-label="执行主机结果路径"
          placeholder="结果路径，例如 primaryHostId"
          value={value.path.join('.')}
          onChange={(event) =>
            onChange({
              ...value,
              path: event.target.value ? event.target.value.split('.') : [],
            })
          }
        />
      </div>
    )}
  </Form.Item>
);
