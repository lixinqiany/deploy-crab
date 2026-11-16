import {
  TASK_HOOK_LABELS,
  TASK_HOOK_PHASES,
  type Task,
  type TaskCatalog,
  type TaskHooks,
} from '@deploy-crab/contracts/task';
import { CloseOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Collapse, Form, Input, InputNumber } from 'antd';
import { TaskCallEditor } from './TaskCallEditor';
import { newCall, nodeKey } from './task-editor-model';
import type { InputDraft } from './task-input-model';
import type { TaskParameter } from '@deploy-crab/contracts/task-input';

interface Props {
  hooks: TaskHooks;
  onChange: (hooks: TaskHooks) => void;
  tasks: Task[];
  catalog: TaskCatalog;
  path: string;
  inputDraft: (path: string) => InputDraft;
  parameters: TaskParameter[];
}
export const TaskHooksEditor = ({
  hooks,
  onChange,
  tasks,
  catalog,
  path,
  inputDraft,
  parameters,
}: Props) => (
  <Collapse
    size="small"
    items={TASK_HOOK_PHASES.map((phase) => ({
      key: phase,
      label: `${TASK_HOOK_LABELS[phase]} · ${hooks[phase].length}`,
      children: (
        <div className="flex flex-col gap-3">
          {hooks[phase].map((hook, index) => {
            const update = (value: typeof hook) =>
              onChange({
                ...hooks,
                [phase]: hooks[phase].map((h, i) => (i === index ? value : h)),
              });
            return (
              <div
                key={hook.key}
                className="rounded-lg border border-sand-4 bg-sand-1 p-3"
              >
                <div className="mb-3 flex items-center gap-2">
                  <Input
                    aria-label="钩子名称"
                    value={hook.title}
                    maxLength={64}
                    onChange={(e) => update({ ...hook, title: e.target.value })}
                  />
                  <Button
                    type="text"
                    icon={<CloseOutlined />}
                    aria-label={`移除钩子 ${hook.title}`}
                    onClick={() =>
                      onChange({
                        ...hooks,
                        [phase]: hooks[phase].filter((_, i) => i !== index),
                      })
                    }
                  />
                </div>
                <TaskCallEditor
                  compact
                  call={hook.call}
                  onChange={(call) => update({ ...hook, call })}
                  tasks={tasks}
                  catalog={catalog}
                  inputDraft={inputDraft(`${path}.${phase}.${hook.key}`)}
                  parameters={parameters}
                />
                <Form.Item label="钩子超时（秒）" className="mb-0">
                  <InputNumber
                    aria-label="钩子超时秒数"
                    min={1}
                    max={3600}
                    value={hook.timeoutMs / 1000}
                    onChange={(seconds) =>
                      update({ ...hook, timeoutMs: (seconds ?? 30) * 1000 })
                    }
                  />
                </Form.Item>
              </div>
            );
          })}
          <Button
            block
            type="dashed"
            icon={<PlusOutlined />}
            disabled={hooks[phase].length >= 8}
            onClick={() =>
              onChange({
                ...hooks,
                [phase]: [
                  ...hooks[phase],
                  {
                    key: nodeKey('hook'),
                    title: `${TASK_HOOK_LABELS[phase]}钩子`,
                    call: newCall('builtin'),
                    timeoutMs: 30_000,
                  },
                ],
              })
            }
          >
            添加钩子
          </Button>
        </div>
      ),
    }))}
  />
);
