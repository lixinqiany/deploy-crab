import type { CreateTaskInput, Task } from '@deploy-crab/contracts/task';
import { Page } from '@deploy-crab/ui/layout/page/Page';
import { EmptyState } from '@deploy-crab/ui/feedback/EmptyState';
import {
  FileTextOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Input, Skeleton } from 'antd';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { tasksApi } from '@/api/tasks';
import { TaskEditor } from './TaskEditor';
import { TaskDetail } from './TaskDetail';
import { blankTask, copyTaskBody, uniqueTaskName } from './task-editor-model';

export const TasksView = () => {
  const { message } = App.useApp();
  const cache = useQueryClient();
  const query = useQuery({ queryKey: ['tasks'], queryFn: tasksApi.list });
  const catalog = useQuery({
    queryKey: ['task-catalog'],
    queryFn: tasksApi.catalog,
  });
  const tasks = query.data ?? [];
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<{
    initial: CreateTaskInput;
    editing: Task | null;
  } | null>(null);
  const selected =
    tasks.find((task) => task.id === params.get('task')) ?? tasks[0];
  const filtered = tasks.filter((task) =>
    `${task.name} ${task.description}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const select = (id: string) => setParams({ task: id }, { replace: true });
  const remove = useMutation({
    mutationFn: tasksApi.delete,
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['tasks'] });
      message.success('任务已删除');
    },
    onError: (error) => message.error(error.message),
  });
  const startFrom = (body: CreateTaskInput) =>
    setEditor({
      initial: {
        ...structuredClone(body),
        name: uniqueTaskName(body.name, tasks),
      },
      editing: null,
    });
  const error = query.error ?? catalog.error;

  return (
    <Page title="任务库">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="m-0 text-sm text-sand-11">
              组合能力、脚本和其他任务，保存为可复用的流程。
            </p>
            <span className="text-xs text-sand-9">{tasks.length} 个任务</span>
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!catalog.data || query.isPending || !!error}
            onClick={() => setEditor({ initial: blankTask(), editing: null })}
          >
            新建任务
          </Button>
        </div>
        {error ? (
          <Alert
            type="error"
            showIcon
            title="任务加载失败"
            description={error.message}
            action={
              <Button
                onClick={() => {
                  void query.refetch();
                  void catalog.refetch();
                }}
              >
                重试
              </Button>
            }
          />
        ) : query.isPending || catalog.isPending ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : (
          <>
            {catalog.data?.templates.map((template) => (
              <div
                key={template.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-line bg-amber-soft px-4 py-3.5"
              >
                <div className="flex items-start gap-3">
                  <FileTextOutlined className="mt-1 text-lg text-amber-text" />
                  <div>
                    <div className="mb-1 text-sm font-medium text-sand-12">
                      从一个完整示例开始 · {template.title}
                    </div>
                    <p className="m-0 text-xs text-sand-11">
                      {template.summary} 复制后可以自由修改。
                    </p>
                  </div>
                </div>
                <Button onClick={() => startFrom(template.task)}>
                  从示例创建
                </Button>
              </div>
            ))}
            {tasks.length === 0 ? (
              <EmptyState
                title="创建你的第一个任务"
                description="添加步骤，组合能力、脚本和其他任务，设置依赖和钩子。"
                actionLabel="新建任务"
                onAction={() =>
                  setEditor({ initial: blankTask(), editing: null })
                }
              />
            ) : (
              <div className="grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
                <aside className="rounded-xl border border-sand-4 bg-sand-1 p-3">
                  <Input
                    aria-label="搜索任务"
                    prefix={<SearchOutlined className="text-sand-9" />}
                    placeholder="搜索任务"
                    allowClear
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="mb-3"
                  />
                  <div className="flex flex-col gap-1.5">
                    {filtered.map((task) => (
                      <button
                        type="button"
                        key={task.id}
                        aria-label={`查看任务 ${task.name}`}
                        aria-pressed={task.id === selected?.id}
                        onClick={() => select(task.id)}
                        className={`rounded-lg border px-3 py-3 text-left transition-colors ${task.id === selected?.id ? 'border-amber-line bg-amber-soft' : 'border-transparent hover:bg-sand-2'}`}
                      >
                        <span className="mb-1 block text-sm font-medium break-all text-sand-12">
                          {task.name}
                        </span>
                        <span className="block truncate text-xs text-sand-9">
                          {task.definition.steps.length} 个步骤 · 版本{' '}
                          {task.revision}
                        </span>
                      </button>
                    ))}
                    {!filtered.length && (
                      <p className="py-4 text-center text-xs text-sand-9">
                        没有匹配的任务
                      </p>
                    )}
                  </div>
                </aside>
                {selected && (
                  <TaskDetail
                    task={selected}
                    tasks={tasks}
                    onEdit={() =>
                      setEditor({
                        initial: copyTaskBody(selected),
                        editing: selected,
                      })
                    }
                    onCopy={() =>
                      startFrom({
                        ...copyTaskBody(selected),
                        name: `${selected.name.slice(0, 59)} 副本`,
                      })
                    }
                    onDelete={() => remove.mutate(selected.id)}
                    deleting={remove.isPending}
                    onOpenTask={select}
                  />
                )}
              </div>
            )}
          </>
        )}
        {editor && catalog.data && (
          <TaskEditor
            initial={editor.initial}
            editing={editor.editing}
            tasks={tasks}
            catalog={catalog.data}
            onClose={() => setEditor(null)}
            onSaved={(task) => select(task.id)}
          />
        )}
      </div>
    </Page>
  );
};
