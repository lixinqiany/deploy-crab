import {
  TASK_HOOK_LABELS,
  TASK_HOOK_PHASES,
  type Task,
  type TaskCall,
  type TaskHooks,
} from '@deploy-crab/contracts/task';
import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import { Button, Collapse, Popconfirm, Tag } from 'antd';
import { callKindLabel } from './task-editor-model';

const CallPreview = ({
  call,
  tasks,
  onOpenTask,
}: {
  call: TaskCall;
  tasks: Task[];
  onOpenTask: (id: string) => void;
}) => {
  if (call.kind === 'task')
    return (
      <Button
        type="link"
        className="h-auto p-0"
        onClick={() => onOpenTask(call.taskId)}
      >
        {tasks.find((task) => task.id === call.taskId)?.name ?? '任务不可用'} →
      </Button>
    );
  if (call.action === 'ssh.probe')
    return (
      <p className="m-0 text-sm text-sand-11">
        确认可以通过 SSH 登录并执行远程命令。
      </p>
    );
  return (
    <details className="text-xs text-sand-11">
      <summary className="cursor-pointer">
        查看 {call.input.shell === 'bash' ? 'Bash' : 'Sh'} 脚本
        {call.input.cwd ? ` · ${call.input.cwd}` : ''}
      </summary>
      <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-sand-12 p-3 font-mono leading-relaxed whitespace-pre-wrap break-all text-sand-3">
        {call.input.script}
      </pre>
    </details>
  );
};

const HooksPreview = ({
  hooks,
  tasks,
  onOpenTask,
}: {
  hooks: TaskHooks;
  tasks: Task[];
  onOpenTask: (id: string) => void;
}) => (
  <div className="flex flex-col gap-3">
    {TASK_HOOK_PHASES.filter((phase) => hooks[phase].length).map((phase) => (
      <div key={phase}>
        <div className="mb-2 text-xs font-medium text-sand-11">
          {TASK_HOOK_LABELS[phase]}
        </div>
        {hooks[phase].map((hook) => (
          <div
            key={hook.key}
            className="mb-2 rounded-lg border border-sand-4 bg-sand-1 p-3"
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-sm text-sand-12">{hook.title}</span>
              <Tag>{callKindLabel(hook.call)}</Tag>
              <span className="text-xs text-sand-9">
                {hook.timeoutMs / 1000} 秒
              </span>
            </div>
            <CallPreview
              call={hook.call}
              tasks={tasks}
              onOpenTask={onOpenTask}
            />
          </div>
        ))}
      </div>
    ))}
  </div>
);

interface Props {
  task: Task;
  tasks: Task[];
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  deleting: boolean;
  onOpenTask: (id: string) => void;
}
export const TaskDetail = ({
  task,
  tasks,
  onEdit,
  onCopy,
  onDelete,
  deleting,
  onOpenTask,
}: Props) => {
  const hooksCount = Object.values(task.definition.hooks).flat().length;
  return (
    <section className="min-w-0 rounded-xl border border-sand-4 bg-sand-1 p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h2 className="m-0 text-lg font-semibold break-all text-sand-12">
              {task.name}
            </h2>
            <Tag>版本 {task.revision}</Tag>
          </div>
          <span className="text-xs text-sand-9">
            {task.definition.steps.length} 个步骤 · 更新于{' '}
            {new Date(task.updatedAt).toLocaleString('zh-CN')}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<EditOutlined />} onClick={onEdit}>
            编辑
          </Button>
          <Button icon={<CopyOutlined />} onClick={onCopy}>
            创建副本
          </Button>
          <Popconfirm
            title={`删除任务「${task.name}」？`}
            description="其他任务仍引用它时无法删除。"
            okText="删除"
            cancelText="取消"
            onConfirm={onDelete}
          >
            <Button
              danger
              icon={<DeleteOutlined />}
              loading={deleting}
              aria-label="删除任务"
            />
          </Popconfirm>
        </div>
      </div>
      {task.description && (
        <p className="mb-3 text-sm leading-relaxed whitespace-pre-wrap text-sand-11">
          {task.description}
        </p>
      )}
      {task.sourceUrl && (
        <a
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-amber-text"
          href={task.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          <LinkOutlined />
          参考文档
        </a>
      )}
      <div className="mt-4 flex flex-col gap-3">
        {task.definition.steps.map((step, index) => {
          const stepHooks = Object.values(step.hooks).flat().length;
          return (
            <article
              key={step.id}
              className="rounded-lg border border-sand-4 bg-sand-2 p-3.5"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="tabular text-xs text-sand-9">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="font-medium text-sand-12">{step.title}</span>
                <Tag
                  color={
                    step.call.kind === 'task'
                      ? 'blue'
                      : step.call.action === 'ssh.exec'
                        ? 'default'
                        : 'gold'
                  }
                >
                  {callKindLabel(step.call)}
                </Tag>
                <span className="ml-auto text-xs text-sand-9">
                  超时 {step.timeoutMs / 1000} 秒
                </span>
              </div>
              <div className="mb-3 text-xs text-sand-9">
                {step.dependsOn.length
                  ? `等待：${step.dependsOn.map((id) => task.definition.steps.find((s) => s.id === id)?.title ?? id).join('、')}`
                  : '无前置依赖 · 可并行'}
              </div>
              <CallPreview
                call={step.call}
                tasks={tasks}
                onOpenTask={onOpenTask}
              />
              {stepHooks > 0 && (
                <Collapse
                  className="mt-3"
                  size="small"
                  items={[
                    {
                      key: 'hooks',
                      label: `${stepHooks} 个步骤钩子`,
                      children: (
                        <HooksPreview
                          hooks={step.hooks}
                          tasks={tasks}
                          onOpenTask={onOpenTask}
                        />
                      ),
                    },
                  ]}
                />
              )}
            </article>
          );
        })}
      </div>
      {hooksCount > 0 && (
        <Collapse
          className="mt-4"
          items={[
            {
              key: 'hooks',
              label: `${hooksCount} 个任务钩子`,
              children: (
                <HooksPreview
                  hooks={task.definition.hooks}
                  tasks={tasks}
                  onOpenTask={onOpenTask}
                />
              ),
            },
          ]}
        />
      )}
    </section>
  );
};
