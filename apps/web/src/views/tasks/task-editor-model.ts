import {
  emptyTaskHooks,
  taskReferences,
  type CreateTaskInput,
  type Task,
  type TaskCall,
  type TaskStep,
} from '@deploy-crab/contracts/task';

export type CallKind = 'builtin' | 'script' | 'task';
export const callKind = (call: TaskCall): CallKind =>
  call.kind === 'task'
    ? 'task'
    : call.action === 'ssh.exec'
      ? 'script'
      : 'builtin';
export const callKindLabel = (call: TaskCall): string =>
  ({ builtin: '内建能力', script: 'Shell 脚本', task: '引用任务' })[
    callKind(call)
  ];
export const newCall = (kind: CallKind): TaskCall =>
  kind === 'task'
    ? { kind: 'task', taskId: '' }
    : kind === 'script'
      ? {
          kind: 'action',
          action: 'ssh.exec',
          input: { script: '', shell: 'bash', cwd: null },
        }
      : { kind: 'action', action: 'ssh.probe', input: {} };
export const nodeKey = (prefix: string): string =>
  `${prefix}-${crypto.randomUUID()}`;
export const newStep = (kind: CallKind, previous?: string): TaskStep => ({
  id: nodeKey('step'),
  title: { builtin: '检查 SSH 连接', script: '执行脚本', task: '引用任务' }[
    kind
  ],
  call: newCall(kind),
  dependsOn: previous ? [previous] : [],
  skippable: false,
  timeoutMs: 60_000,
  hooks: emptyTaskHooks(),
});
export const blankTask = (): CreateTaskInput => ({
  name: '',
  description: '',
  labels: [],
  sourceUrl: null,
  definition: {
    schemaVersion: 1,
    parameters: [],
    steps: [],
    hooks: emptyTaskHooks(),
  },
});
export const copyTaskBody = (task: Task): CreateTaskInput => ({
  name: task.name,
  description: task.description,
  labels: [...task.labels],
  sourceUrl: task.sourceUrl,
  definition: structuredClone(task.definition),
});
export const availableTaskReferences = (
  tasks: Task[],
  currentId?: string,
): Task[] => {
  if (!currentId) return tasks;
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const reachesCurrent = (id: string, seen = new Set<string>()): boolean => {
    if (id === currentId) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    const task = byId.get(id);
    return (
      !!task &&
      taskReferences(task.definition).some((next) => reachesCurrent(next, seen))
    );
  };
  return tasks.filter((task) => !reachesCurrent(task.id));
};
export const uniqueTaskName = (name: string, tasks: Task[]): string => {
  const names = new Set(tasks.map((task) => task.name.toLowerCase()));
  if (!names.has(name.toLowerCase())) return name;
  for (let index = 2; ; index++) {
    const next = `${name.slice(0, 54)} (${index})`;
    if (!names.has(next.toLowerCase())) return next;
  }
};

export const taskLabelOptions = (tasks: Task[]) =>
  [...new Set(tasks.flatMap((task) => task.labels))]
    .sort((a, b) => a.localeCompare(b))
    .map((label) => ({ value: label, label }));

/** 名称、说明、标签共享搜索；多个关键词及所选标签均须匹配。 */
export const matchesTask = (
  task: Task,
  search: string,
  labels: string[] = [],
): boolean => {
  const text =
    `${task.name}\n${task.description}\n${task.labels.join('\n')}`.toLowerCase();
  return (
    labels.every((label) => task.labels.includes(label)) &&
    search
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .every((word) => text.includes(word))
  );
};
