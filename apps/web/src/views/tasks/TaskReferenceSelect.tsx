import type { Task } from '@deploy-crab/contracts/task';
import { Select, Tag } from 'antd';
import { useState } from 'react';
import { matchesTask, taskLabelOptions } from './task-editor-model';

interface Props {
  tasks: Task[];
  value: string;
  onChange: (taskId: string) => void;
}

export const TaskReferenceSelect = ({ tasks, value, onChange }: Props) => {
  const [labels, setLabels] = useState<string[]>([]);
  const selected = tasks.find((task) => task.id === value);
  return (
    <div className="flex flex-col gap-2">
      <Select
        mode="multiple"
        aria-label="引用任务标签筛选"
        placeholder="按标签筛选（同时包含）"
        allowClear
        value={labels}
        options={taskLabelOptions(tasks)}
        onChange={setLabels}
        maxTagCount="responsive"
        showSearch={{ optionFilterProp: 'label' }}
      />
      <Select
        aria-label="选择引用任务"
        value={value || null}
        placeholder="搜索名称、说明或标签"
        showSearch={{
          filterOption: (input, option) =>
            !!option && matchesTask(option.task, input),
        }}
        options={tasks
          .filter((task) => matchesTask(task, '', labels))
          .map((task) => ({ value: task.id, label: task.name, task }))}
        labelRender={({ label }) => selected?.name ?? label}
        virtual={false}
        notFoundContent="没有匹配的任务"
        optionRender={({ data }) => (
          <div className="py-1">
            <div className="truncate font-medium">{data.task.name}</div>
            {data.task.description && (
              <div className="mt-1 truncate text-xs text-sand-9">
                {data.task.description}
              </div>
            )}
            {data.task.labels.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {data.task.labels.map((label) => (
                  <Tag key={label} className="m-0">
                    {label}
                  </Tag>
                ))}
              </div>
            )}
          </div>
        )}
        onChange={onChange}
      />
    </div>
  );
};
