import type { Task, TaskCall, TaskCatalog } from '@deploy-crab/contracts/task';
import { Form, Input, Segmented, Select } from 'antd';
import { callKind, newCall, type CallKind } from './task-editor-model';
import { TaskReferenceSelect } from './TaskReferenceSelect';
import { TaskInputEditor } from './TaskInputEditor';
import type { InputDraft } from './task-input-model';
import type { TaskParameter } from '@deploy-crab/contracts/task-input';
import { TaskScriptHelp } from './TaskScriptHelp';

interface Props {
  call: TaskCall;
  onChange: (call: TaskCall) => void;
  tasks: Task[];
  catalog: TaskCatalog;
  compact?: boolean;
  inputDraft: InputDraft;
  parameters: TaskParameter[];
  resultSteps?: { id: string; title: string }[];
}

export const TaskCallEditor = ({
  call,
  onChange,
  tasks,
  catalog,
  compact = false,
  inputDraft,
  parameters,
  resultSteps = [],
}: Props) => (
  <>
    <Form.Item label="调用方式">
      <Segmented<CallKind>
        block
        value={callKind(call)}
        onChange={(kind) => {
          inputDraft.clear();
          onChange(newCall(kind));
        }}
        options={[
          { value: 'builtin', label: '内建能力' },
          { value: 'script', label: 'Shell 脚本' },
          { value: 'task', label: '引用任务' },
        ]}
      />
    </Form.Item>
    {call.kind === 'task' ? (
      <>
        <Form.Item
          label="选择任务"
          extra={
            tasks.length
              ? '复用已保存的任务定义，步骤会等待被引用的任务完成。'
              : '先保存一个独立任务，再在这里引用。'
          }
        >
          <TaskReferenceSelect
            value={call.taskId}
            tasks={tasks}
            onChange={(taskId: string) => {
              if (taskId === call.taskId) return;
              inputDraft.clear();
              onChange({ kind: 'task', taskId });
            }}
          />
        </Form.Item>
        <TaskInputEditor
          task={tasks.find((task) => task.id === call.taskId)}
          mapping={call}
          parentParameters={parameters}
          draft={inputDraft}
          resultSteps={resultSteps}
        />
      </>
    ) : call.action === 'ssh.probe' ? (
      <Form.Item
        label="选择能力"
        extra={
          catalog.actions.find((action) => action.key === call.action)
            ?.description
        }
      >
        <Select
          aria-label="选择内建能力"
          value={call.action}
          options={catalog.actions
            .filter((action) => action.editor === 'builtin')
            .map((action) => ({ value: action.key, label: action.name }))}
          onChange={() => onChange(newCall('builtin'))}
        />
      </Form.Item>
    ) : (
      <>
        <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-3">
          <Form.Item label="Shell">
            <Select
              aria-label="脚本 Shell"
              value={call.input.shell}
              options={[
                { value: 'bash', label: 'Bash' },
                { value: 'sh', label: 'Sh' },
              ]}
              onChange={(shell: 'bash' | 'sh') =>
                onChange({ ...call, input: { ...call.input, shell } })
              }
            />
          </Form.Item>
          <Form.Item label="工作目录（可选）">
            <Input
              aria-label="脚本工作目录"
              value={call.input.cwd ?? ''}
              placeholder="例如 /opt/my-app"
              onChange={(e) =>
                onChange({
                  ...call,
                  input: { ...call.input, cwd: e.target.value || null },
                })
              }
            />
          </Form.Item>
        </div>
        <Form.Item
          label="脚本输出"
          extra="JSON 模式将 stdout 保存为步骤结果供后续绑定；日志请写到 stderr。"
        >
          <Select
            aria-label="脚本输出格式"
            value={call.input.output ?? 'text'}
            options={[
              { value: 'text', label: '终端日志' },
              { value: 'json', label: '结构化 JSON 结果' },
            ]}
            onChange={(output: 'text' | 'json') =>
              onChange({ ...call, input: { ...call.input, output } })
            }
          />
        </Form.Item>
        <Form.Item
          label="脚本内容"
          extra="通过 DEPLOY_CRAB_INPUT 读取任务参数，展开下方说明可查看当前字段的读取示例。"
        >
          <Input.TextArea
            aria-label="脚本内容"
            value={call.input.script}
            spellCheck={false}
            className="font-mono text-xs"
            autoSize={{ minRows: compact ? 5 : 12, maxRows: 24 }}
            placeholder={'set -e\n# 在这里编写脚本'}
            onChange={(e) =>
              onChange({
                ...call,
                input: { ...call.input, script: e.target.value },
              })
            }
          />
        </Form.Item>
        <Form.Item
          label="脚本使用的任务参数"
          extra="默认使用全部参数。明确选择后，Session 可根据跳过的步骤收起未使用参数；脚本也只会收到选中的字段。"
        >
          <Segmented
            block
            value={call.usesInputs === undefined ? 'all' : 'selected'}
            options={[
              { value: 'all', label: '全部参数' },
              { value: 'selected', label: '明确选择' },
            ]}
            onChange={(mode) => {
              const { usesInputs: _usesInputs, ...base } = call;
              onChange(mode === 'all' ? base : { ...base, usesInputs: [] });
            }}
          />
          {call.usesInputs !== undefined && (
            <Select
              className="mt-2 w-full"
              aria-label="脚本使用的参数"
              mode="multiple"
              value={call.usesInputs}
              placeholder="不选择表示此脚本不使用任务参数"
              options={parameters.map((p) => ({
                value: p.name,
                label: p.title ? `${p.title} · ${p.name}` : p.name,
              }))}
              onChange={(usesInputs: string[]) =>
                onChange({ ...call, usesInputs })
              }
            />
          )}
        </Form.Item>
        <TaskScriptHelp
          parameters={parameters.filter(
            (parameter) =>
              call.usesInputs === undefined ||
              call.usesInputs.includes(parameter.name),
          )}
        />
      </>
    )}
  </>
);
