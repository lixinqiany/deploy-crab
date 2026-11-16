import type { Task } from '@deploy-crab/contracts/task';
import {
  CheckOutlined,
  DownOutlined,
  LeftOutlined,
  ReadOutlined,
  RightOutlined,
  SearchOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { Button, Empty, Input, Popover, Tag } from 'antd';
import { useState } from 'react';
import { matchesTask, taskLabelOptions } from './task-editor-model';

interface Props {
  tasks: Task[];
  value: string;
  onChange: (taskId: string) => void;
}

/** 一个选择入口：直接搜索所有任务，或进入标签目录再选任务。 */
export const TaskReferenceSelect = ({ tasks, value, onChange }: Props) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [browseLabels, setBrowseLabels] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  const selected = tasks.find((task) => task.id === value);
  const labels = taskLabelOptions(tasks);
  const results = tasks.filter((task) =>
    matchesTask(task, search, label ? [label] : []),
  );
  return (
    <Popover
      open={open}
      trigger="click"
      placement="bottomLeft"
      arrow={false}
      destroyOnHidden
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setSearch('');
          setBrowseLabels(false);
          setLabel(null);
        }
      }}
      styles={{ container: { padding: 0 } }}
      content={
        <div
          role="dialog"
          aria-label="任务选择器"
          className="w-[min(400px,calc(100vw-48px))]"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
          }}
        >
          <div className="border-b border-sand-4 p-3">
            <Input
              autoFocus
              allowClear
              aria-label="搜索引用任务"
              prefix={<SearchOutlined className="text-sand-9" />}
              placeholder="搜索任务名称、标签或关键词"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setLabel(null);
                setBrowseLabels(false);
              }}
            />
          </div>
          <div className="flex items-center justify-between border-b border-sand-4 px-3 py-2 text-xs">
            {label || browseLabels ? (
              <Button
                size="small"
                type="text"
                icon={<LeftOutlined />}
                onClick={() => {
                  if (label) {
                    setLabel(null);
                    setBrowseLabels(true);
                  } else setBrowseLabels(false);
                }}
              >
                {label ? '所有标签' : '全部任务'}
              </Button>
            ) : (
              <span className="text-sand-9">
                {search
                  ? `搜索结果 · ${results.length}`
                  : `全部任务 · ${tasks.length}`}
              </span>
            )}
            {label ? (
              <Tag className="m-0" color="gold">
                {label}
              </Tag>
            ) : browseLabels ? (
              <span className="text-sand-9">选择标签查看任务</span>
            ) : (
              !search && (
                <Button
                  size="small"
                  type="text"
                  icon={<TagsOutlined />}
                  disabled={!labels.length}
                  onClick={() => setBrowseLabels(true)}
                >
                  按标签浏览 <RightOutlined />
                </Button>
              )
            )}
          </div>
          <div className="max-h-80 overflow-y-auto p-1.5">
            {browseLabels && !label ? (
              labels.map(({ value: name }) => (
                <button
                  key={name}
                  type="button"
                  aria-label={`浏览标签 ${name}`}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm hover:bg-sand-3 focus-visible:bg-sand-3"
                  onClick={() => setLabel(name)}
                >
                  <TagsOutlined className="text-sand-9" />
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                  <span className="text-xs text-sand-9">
                    {tasks.filter((task) => task.labels.includes(name)).length}
                  </span>
                  <RightOutlined className="text-xs text-sand-9" />
                </button>
              ))
            ) : results.length ? (
              results.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  aria-label={`选择任务 ${task.name}`}
                  aria-pressed={value === task.id}
                  className={`flex w-full gap-2 rounded-md px-3 py-2.5 text-left hover:bg-sand-3 focus-visible:bg-sand-3 ${value === task.id ? 'bg-amber-soft' : ''}`}
                  onClick={() => {
                    onChange(task.id);
                    setOpen(false);
                  }}
                >
                  <ReadOutlined className="mt-1 text-sand-9" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-sand-12">
                      {task.name}
                    </span>
                    {task.description && (
                      <span className="mt-1 line-clamp-2 text-xs text-sand-9">
                        {task.description}
                      </span>
                    )}
                    {!!task.labels.length && (
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {task.labels.map((item) => (
                          <Tag key={item} className="m-0">
                            {item}
                          </Tag>
                        ))}
                      </span>
                    )}
                  </span>
                  {value === task.id && (
                    <CheckOutlined className="text-amber-text" />
                  )}
                </button>
              ))
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="没有匹配的任务"
              />
            )}
          </div>
        </div>
      }
    >
      <Button
        block
        aria-label="选择引用任务"
        className="flex items-center justify-between text-left"
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="min-w-0 truncate">
          {selected?.name ?? '选择任务，或搜索名称与标签'}
        </span>
        <DownOutlined className="text-xs text-sand-9" />
      </Button>
    </Popover>
  );
};
