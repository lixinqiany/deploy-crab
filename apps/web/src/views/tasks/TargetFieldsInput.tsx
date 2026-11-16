import type { TaskParameter } from '@deploy-crab/contracts/task-input';
import type { TaskTargetInfo } from '@deploy-crab/contracts/task-placement';
import { Input, InputNumber } from 'antd';
const numberValue = (value: unknown) =>
  typeof value === 'number' ? value : null;
const textValue = (value: unknown) => (typeof value === 'string' ? value : '');

export const TargetFieldsInput = ({
  parameter,
  targets,
  value,
  onChange,
}: {
  parameter: TaskParameter;
  targets: TaskTargetInfo[];
  value: string;
  onChange: (value: string) => void;
}) => {
  let saved: Record<string, unknown>[] = [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed))
      saved = parsed.filter(
        (row): row is Record<string, unknown> =>
          !!row && typeof row === 'object' && !Array.isArray(row),
      );
  } catch {
    /* 尚未填写 */
  }
  const fields = parameter.targetFields ?? [];
  const rows: Record<string, unknown>[] = targets.map((target) => ({
    ...Object.fromEntries(
      fields.map((field) => [field.name, field.defaultValue ?? '']),
    ),
    ...saved.find((row) => row.hostId === target.id),
    hostId: target.id,
  }));
  const update = (index: number, name: string, next: string | number | null) =>
    onChange(
      JSON.stringify(
        rows.map((row, i) => (i === index ? { ...row, [name]: next } : row)),
      ),
    );
  return (
    <div className="flex flex-col gap-3">
      {!targets.length && <p className="text-sand-9">请先选择执行目标。</p>}
      {targets.map((target, index) => (
        <div
          key={target.id}
          className="rounded-lg border border-sand-4 bg-sand-1 p-3"
        >
          <div className="mb-2 font-medium">{target.name}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((field) => (
              <label
                key={field.name}
                className="flex flex-col gap-1 text-xs text-sand-11"
              >
                {field.title}
                {field.type === 'number' ? (
                  <InputNumber
                    aria-label={`${target.name} ${field.title}`}
                    className="w-full"
                    value={numberValue(rows[index]?.[field.name])}
                    onChange={(next) => update(index, field.name, next)}
                  />
                ) : (
                  <Input
                    aria-label={`${target.name} ${field.title}`}
                    value={textValue(rows[index]?.[field.name])}
                    onChange={(event) =>
                      update(index, field.name, event.target.value)
                    }
                  />
                )}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
