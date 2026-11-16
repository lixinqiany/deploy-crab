import {
  CreateTaskInput,
  type Task,
  type TaskCatalog,
  type TaskStep,
} from '@deploy-crab/contracts/task';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CopyOutlined,
  DeleteOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Collapse,
  Drawer,
  Dropdown,
  Empty,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  Tag,
} from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { tasksApi } from '@/api/tasks';
import { TaskCallEditor } from './TaskCallEditor';
import { TaskHooksEditor } from './TaskHooksEditor';
import {
  resolveInputDrafts,
  type InputDrafts,
  type InputFieldDraft,
} from './task-input-model';
import {
  parameterDraft,
  resolveParameterDrafts,
} from './parameter-editor-model';
import { TaskParameterEditor } from './TaskParameterEditor';
import {
  availableTaskReferences,
  callKindLabel,
  newStep,
  nodeKey,
  taskLabelOptions,
  type CallKind,
} from './task-editor-model';

interface Props {
  initial: CreateTaskInput;
  editing: Task | null;
  tasks: Task[];
  catalog: TaskCatalog;
  onClose: () => void;
  onSaved: (task: Task) => void;
}

export const TaskEditor = ({
  initial,
  editing,
  tasks,
  catalog,
  onClose,
  onSaved,
}: Props) => {
  const { message, modal } = App.useApp();
  const cache = useQueryClient();
  const [draft, setDraft] = useState(() => structuredClone(initial));
  const [selectedId, setSelectedId] = useState(initial.definition.steps[0]?.id);
  const [errors, setErrors] = useState<string[]>([]);
  const [inputDrafts, setInputDrafts] = useState<InputDrafts>({});
  const [parameterDrafts, setParameterDrafts] = useState(() =>
    (initial.definition.parameters ?? []).map(parameterDraft),
  );
  const parameterState = resolveParameterDrafts(parameterDrafts);
  const inputDraft = (path: string) => ({
    fields: inputDrafts[path] ?? {},
    onChange: (name: string, field: InputFieldDraft) =>
      setInputDrafts((previous) => ({
        ...previous,
        [path]: { ...previous[path], [name]: field },
      })),
    clear: () => setInputDrafts((previous) => ({ ...previous, [path]: {} })),
  });
  const resolved = resolveInputDrafts(
    { ...draft.definition, parameters: parameterState.parameters },
    inputDrafts,
    tasks,
  );
  const body = {
    ...draft,
    definition: {
      ...resolved.definition,
      parameters: parameterState.parameters,
    },
  };
  const steps = draft.definition.steps;
  const selected = steps.find((step) => step.id === selectedId);
  const selectedIndex = steps.findIndex((step) => step.id === selectedId);
  const references = availableTaskReferences(tasks, editing?.id);
  const dirty =
    resolved.errors.length > 0 ||
    parameterState.errors.length > 0 ||
    JSON.stringify(body) !== JSON.stringify(initial);
  const setSteps = (next: TaskStep[]) =>
    setDraft({ ...draft, definition: { ...draft.definition, steps: next } });
  const updateStep = (next: TaskStep) =>
    setSteps(steps.map((step) => (step.id === next.id ? next : step)));
  const save = useMutation({
    mutationFn: (body: CreateTaskInput) =>
      editing
        ? tasksApi.update(editing.id, { ...body, revision: editing.revision })
        : tasksApi.create(body),
    onSuccess: async (task) => {
      await cache.invalidateQueries({ queryKey: ['tasks'] });
      message.success(`已保存 ${task.name}`);
      onSaved(task);
      onClose();
    },
    onError: (error) => setErrors([error.message]),
  });
  const submit = () => {
    if (resolved.errors.length || parameterState.errors.length) {
      setErrors([...parameterState.errors, ...resolved.errors]);
      return;
    }
    const parsed = CreateTaskInput.safeParse(body);
    if (!parsed.success) {
      setErrors(
        parsed.error.issues.map((issue) => {
          const stepIndex =
            issue.path[0] === 'definition' &&
            issue.path[1] === 'steps' &&
            typeof issue.path[2] === 'number'
              ? issue.path[2]
              : undefined;
          return stepIndex === undefined
            ? issue.message
            : `步骤 ${stepIndex + 1}「${steps[stepIndex]?.title ?? ''}」：${issue.message}`;
        }),
      );
      const issue = parsed.error.issues.find(
        (item) => item.path[1] === 'steps' && typeof item.path[2] === 'number',
      );
      if (issue) setSelectedId(steps[issue.path[2] as number]?.id);
      return;
    }
    setErrors([]);
    save.mutate(parsed.data);
  };
  const close = () => {
    if (save.isPending) return;
    if (!dirty) {
      onClose();
      return;
    }
    modal.confirm({
      title: '放弃未保存的修改？',
      content: '任务的修改还没有保存。',
      okText: '放弃修改',
      cancelText: '继续编辑',
      onOk: onClose,
    });
  };
  const add = (kind: CallKind) => {
    const step = newStep(kind, steps.at(-1)?.id);
    setSteps([...steps, step]);
    setSelectedId(step.id);
  };
  const move = (offset: number) => {
    const next = [...steps],
      to = selectedIndex + offset;
    if (selectedIndex < 0 || to < 0 || to >= next.length) return;
    [next[selectedIndex], next[to]] = [next[to]!, next[selectedIndex]!];
    setSteps(next);
  };
  const remove = () => {
    if (!selected) return;
    const dependents = steps.filter((step) =>
      step.dependsOn.includes(selected.id),
    );
    if (dependents.length) {
      message.warning(
        `请先调整这些步骤的依赖：${dependents.map((step) => step.title).join('、')}`,
      );
      return;
    }
    const next = steps.filter((step) => step.id !== selected.id);
    setSteps(next);
    setSelectedId(next[Math.min(selectedIndex, next.length - 1)]?.id);
  };
  // 排除自己和已依赖自己的节点，避免在界面上选择出一个环。
  const dependsOnSelected = (id: string, seen = new Set<string>()): boolean => {
    if (id === selectedId) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return (
      steps
        .find((step) => step.id === id)
        ?.dependsOn.some((dep) => dependsOnSelected(dep, seen)) ?? false
    );
  };

  return (
    <Drawer
      open
      onClose={close}
      size={1080}
      title={editing ? `编辑任务 · ${editing.name}` : '创建任务'}
      destroyOnHidden
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-sand-9">
            {steps.length} 个步骤 · 保存为可复用任务
          </span>
          <div className="flex gap-2">
            <Button onClick={close}>取消</Button>
            <Button type="primary" loading={save.isPending} onClick={submit}>
              保存任务
            </Button>
          </div>
        </div>
      }
    >
      <Form
        layout="vertical"
        component="div"
        requiredMark={false}
        disabled={save.isPending}
      >
        {errors.length > 0 && (
          <Alert
            type="error"
            showIcon
            className="mb-4"
            title="任务尚未保存"
            description={
              <div>
                {[...new Set(errors)].map((error) => (
                  <div key={error}>{error}</div>
                ))}
              </div>
            }
          />
        )}
        <div className="grid gap-x-4 md:grid-cols-2">
          <Form.Item label="任务名称">
            <Input
              aria-label="任务名称"
              value={draft.name}
              placeholder="例如 检查主机环境"
              maxLength={64}
              autoFocus
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Form.Item>
          <Form.Item label="参考文档（可选）">
            <Input
              aria-label="参考文档"
              value={draft.sourceUrl ?? ''}
              placeholder="https://…"
              onChange={(e) =>
                setDraft({ ...draft, sourceUrl: e.target.value || null })
              }
            />
          </Form.Item>
        </div>
        <Form.Item
          label="标签"
          extra="输入后按回车创建，也可选择已有标签；最多 20 个。"
        >
          <Select
            mode="tags"
            aria-label="任务标签"
            placeholder="例如 部署、数据库、巡检"
            value={draft.labels}
            options={taskLabelOptions(tasks)}
            tokenSeparators={[',', '，', ' ']}
            maxCount={20}
            maxTagCount="responsive"
            onChange={(labels: string[]) =>
              setDraft({
                ...draft,
                labels: [
                  ...new Set(
                    labels.map((label) => label.trim()).filter(Boolean),
                  ),
                ],
              })
            }
          />
        </Form.Item>
        <Form.Item label="说明">
          <Input.TextArea
            aria-label="任务说明"
            autoSize={{ minRows: 2, maxRows: 4 }}
            value={draft.description}
            maxLength={500}
            placeholder="这个任务做什么，有哪些使用前提"
            onChange={(e) =>
              setDraft({ ...draft, description: e.target.value })
            }
          />
        </Form.Item>
        <TaskParameterEditor
          parameters={parameterDrafts}
          onChange={setParameterDrafts}
        />
        <div className="grid items-start gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
          <div className="rounded-xl border border-sand-4 bg-sand-2 p-3">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-medium text-sand-12">任务步骤</span>
              <span className="text-xs text-sand-9">{steps.length} / 64</span>
            </div>
            <div className="mb-3 md:hidden">
              <Select
                className="w-full"
                aria-label="选择编辑步骤"
                value={selectedId ?? null}
                placeholder="选择步骤"
                onChange={(id: string) => setSelectedId(id)}
                options={steps.map((step, index) => ({
                  value: step.id,
                  label: `${index + 1}. ${step.title || '未命名步骤'}${step.skippable ? ' · 可跳过' : ''}`,
                }))}
              />
            </div>
            <div className="mb-3 hidden flex-col gap-1.5 md:flex">
              {steps.map((step, index) => (
                <button
                  type="button"
                  key={step.id}
                  aria-label={`编辑步骤 ${index + 1} ${step.title}`}
                  aria-pressed={selectedId === step.id}
                  onClick={() => setSelectedId(step.id)}
                  className={`flex min-w-0 items-start gap-2 rounded-lg border px-2.5 py-2.5 text-left transition-colors ${selectedId === step.id ? 'border-amber-line bg-amber-soft' : 'border-transparent hover:bg-sand-3'}`}
                >
                  <span className="tabular mt-0.5 w-5 shrink-0 text-xs text-sand-9">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-sand-12">
                      {step.title || '未命名步骤'}
                    </span>
                    <span className="text-[11px] text-sand-9">
                      {callKindLabel(step.call)}
                      {step.skippable ? ' · 可跳过' : ''}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <Dropdown
              menu={{
                items: [
                  { key: 'builtin', label: '内建能力' },
                  { key: 'script', label: 'Shell 脚本' },
                  { key: 'task', label: '引用任务' },
                ],
                onClick: ({ key }) => add(key as CallKind),
              }}
              trigger={['click']}
              disabled={steps.length >= 64}
            >
              <Button block type="dashed" icon={<PlusOutlined />}>
                添加步骤
              </Button>
            </Dropdown>
          </div>
          <div className="min-w-0 rounded-xl border border-sand-4 bg-sand-1 p-4">
            {selected ? (
              <>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <Tag color="gold">步骤 {selectedIndex + 1}</Tag>
                  <div className="flex gap-1">
                    <Button
                      size="small"
                      icon={<ArrowUpOutlined />}
                      aria-label="步骤上移"
                      disabled={selectedIndex === 0}
                      onClick={() => move(-1)}
                    />
                    <Button
                      size="small"
                      icon={<ArrowDownOutlined />}
                      aria-label="步骤下移"
                      disabled={selectedIndex === steps.length - 1}
                      onClick={() => move(1)}
                    />
                    <Button
                      size="small"
                      icon={<CopyOutlined />}
                      aria-label="复制步骤"
                      disabled={steps.length >= 64}
                      onClick={() => {
                        const copy = {
                          ...structuredClone(selected),
                          id: nodeKey('step'),
                          title: `${selected.title.slice(0, 59)} 副本`,
                        };
                        const next = [...steps];
                        const prefix = `steps.${selected.id}.`;
                        setInputDrafts((previous) => ({
                          ...previous,
                          ...Object.fromEntries(
                            Object.entries(previous)
                              .filter(([path]) => path.startsWith(prefix))
                              .map(([path, text]) => [
                                `steps.${copy.id}.${path.slice(prefix.length)}`,
                                text,
                              ]),
                          ),
                        }));
                        next.splice(selectedIndex + 1, 0, copy);
                        setSteps(next);
                        setSelectedId(copy.id);
                      }}
                    />
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label="删除步骤"
                      onClick={remove}
                    />
                  </div>
                </div>
                <Form.Item label="步骤名称">
                  <Input
                    aria-label="步骤名称"
                    value={selected.title}
                    maxLength={64}
                    onChange={(e) =>
                      updateStep({ ...selected, title: e.target.value })
                    }
                  />
                </Form.Item>
                <Form.Item
                  label="允许跳过"
                  extra="默认执行；开启后，可在 Session 执行时选择跳过这一步。"
                >
                  <Switch
                    aria-label="步骤可跳过"
                    checked={selected.skippable}
                    checkedChildren="可跳过"
                    unCheckedChildren="必做"
                    onChange={(skippable) =>
                      updateStep({ ...selected, skippable })
                    }
                  />
                </Form.Item>
                <TaskCallEditor
                  parameters={parameterState.parameters}
                  inputDraft={inputDraft(`steps.${selected.id}.call`)}
                  call={selected.call}
                  onChange={(call) => updateStep({ ...selected, call })}
                  tasks={references}
                  catalog={catalog}
                />
                <div className="grid gap-x-3 sm:grid-cols-[minmax(0,1fr)_120px]">
                  <Form.Item
                    label="等待这些步骤成功"
                    extra="不选择依赖即可并行；上下排序只调整展示顺序。"
                  >
                    <Select
                      mode="multiple"
                      aria-label="步骤依赖"
                      value={selected.dependsOn}
                      placeholder="无依赖"
                      options={steps
                        .filter((step) => !dependsOnSelected(step.id))
                        .map((step) => ({ value: step.id, label: step.title }))}
                      onChange={(dependsOn: string[]) =>
                        updateStep({ ...selected, dependsOn })
                      }
                    />
                  </Form.Item>
                  <Form.Item label="超时（秒）">
                    <InputNumber
                      aria-label="步骤超时秒数"
                      className="w-full"
                      min={1}
                      max={3600}
                      value={selected.timeoutMs / 1000}
                      onChange={(seconds) =>
                        updateStep({
                          ...selected,
                          timeoutMs: (seconds ?? 60) * 1000,
                        })
                      }
                    />
                  </Form.Item>
                </div>
                <Collapse
                  size="small"
                  items={[
                    {
                      key: 'step-hooks',
                      label: `步骤钩子 · ${Object.values(selected.hooks).flat().length}`,
                      children: (
                        <TaskHooksEditor
                          parameters={parameterState.parameters}
                          path={`steps.${selected.id}.hooks`}
                          inputDraft={inputDraft}
                          hooks={selected.hooks}
                          onChange={(hooks) =>
                            updateStep({ ...selected, hooks })
                          }
                          tasks={references}
                          catalog={catalog}
                        />
                      ),
                    },
                  ]}
                />
              </>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="添加一个步骤，开始组合任务"
              />
            )}
          </div>
        </div>
        <Collapse
          className="mt-4"
          items={[
            {
              key: 'task-hooks',
              label: `任务钩子 · ${Object.values(draft.definition.hooks).flat().length}`,
              children: (
                <>
                  <p className="mt-0 text-xs text-sand-11">
                    应用于整个任务。钩子失败会影响任务结果，结束时的钩子用于收尾。
                  </p>
                  <TaskHooksEditor
                    parameters={parameterState.parameters}
                    path="hooks"
                    inputDraft={inputDraft}
                    hooks={draft.definition.hooks}
                    onChange={(hooks) =>
                      setDraft({
                        ...draft,
                        definition: { ...draft.definition, hooks },
                      })
                    }
                    tasks={references}
                    catalog={catalog}
                  />
                </>
              ),
            },
          ]}
        />
      </Form>
    </Drawer>
  );
};
