import { Task, type CreateTaskBody } from '@deploy-crab/contracts/task';
import { configureTask } from '@deploy-crab/contracts/task-configuration';
import { SshScriptInput } from '@deploy-crab/contracts/ssh-script';
import { isExecutionFinished } from '@deploy-crab/contracts/execution';
import type { ConnectionTarget } from '@deploy-crab/contracts/connection';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { compileStoredTask } from './stored-task-planner';
import { ExecutionService } from '../execution/execution-service';
import { ActionRegistry } from '../execution/action-registry';
import { MemoryRunStore } from '../execution/run-store';
import type { ActionContext } from '../execution/definition';

const script = (text: string, usesInputs?: string[]) => ({
  kind: 'action' as const,
  action: 'ssh.exec' as const,
  input: { script: text },
  ...(usesInputs ? { usesInputs } : {}),
});
const task = (name: string, definition: CreateTaskBody['definition']): Task =>
  Task.parse({
    id: randomUUID(),
    name,
    definition,
    revision: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
const target: ConnectionTarget = {
  hostId: null,
  endpoint: {
    address: 'example.test',
    port: 22,
    user: 'root',
    auth: { method: 'agent' },
  },
  jumps: [],
};
const fixture = () => {
  const child = task('child', {
    parameters: [{ name: 'url', required: true }],
    steps: [{ id: 'work', title: 'work', call: script('work') }],
  });
  const call = {
    kind: 'task' as const,
    taskId: child.id,
    inputBindings: { url: { from: 'taskInput' as const, key: 'mirror' } },
  };
  const parent = task('parent', {
    parameters: [{ name: 'mirror', required: true }],
    steps: [
      { id: 'a', title: 'A', call, skippable: true },
      { id: 'b', title: 'B', call, skippable: true },
    ],
  });
  return { parent, child, call };
};
const finished = async (engine: ExecutionService, id: string) => {
  await expect
    .poll(() => engine.get(id).status, { timeout: 3000 })
    .not.toMatch(/queued|running/);
  return engine.get(id);
};

describe('已保存任务的执行计划', () => {
  it('多个使用方取并集，全部跳过才收起必填字段，恢复步骤后恢复校验', () => {
    const { parent, child } = fixture();
    const all = configureTask(parent, [child]);
    expect(all.configured.usage[0]?.consumers).toHaveLength(2);
    expect(all.configured.usage[0]?.required).toBe(true);
    const one = configureTask(parent, [child], ['steps.a']);
    expect(one.configured.usage[0]?.consumers).toHaveLength(1);
    expect(() => compileStoredTask(one.configured, target, 'host', {})).toThrow(
      '参数',
    );
    const none = configureTask(parent, [child], ['steps.a', 'steps.b']);
    expect(none.configured.parameters).toEqual([]);
    expect(
      compileStoredTask(none.configured, target, 'host', { mirror: 123 }).input,
    ).toEqual({});
    expect(() => configureTask(parent, [child], ['unknown'])).toThrow(
      '不允许跳过',
    );
  });
  it('脚本默认保守使用全部参数，显式选择可缩小范围，任务钩子仍计入使用方', () => {
    const { parent, child } = fixture();
    parent.definition.steps.push(
      Task.parse({
        ...parent,
        definition: {
          steps: [{ id: 'script', title: 'script', call: script('script') }],
        },
      }).definition.steps[0]!,
    );
    expect(
      configureTask(parent, [child], ['steps.a', 'steps.b']).configured.usage[0]
        ?.active,
    ).toBe(true);
    const call = parent.definition.steps[2]!.call;
    if (call.kind === 'action' && call.action === 'ssh.exec')
      call.usesInputs = [];
    expect(
      configureTask(parent, [child], ['steps.a', 'steps.b']).configured.usage[0]
        ?.active,
    ).toBe(false);
    parent.definition.hooks.finally.push({
      key: 'cleanup',
      title: 'cleanup',
      call: {
        kind: 'action',
        action: 'ssh.exec',
        input: SshScriptInput.parse({ script: 'cleanup' }),
        usesInputs: ['mirror'],
      },
      timeoutMs: 1000,
    });
    expect(
      configureTask(parent, [child], ['steps.a', 'steps.b']).configured.usage[0]
        ?.active,
    ).toBe(true);
  });
  it('嵌套跳过按调用位置隔离，子任务默认值和有效必填规则向上解析', () => {
    const { parent, child } = fixture();
    child.definition.steps[0]!.skippable = true;
    parent.definition.parameters[0]!.required = false;
    const one = configureTask(parent, [child], ['steps.a.task.steps.work']);
    expect(one.configured.usage[0]?.consumers.map((use) => use.title)).toEqual([
      'parent / B',
    ]);
    expect(one.configured.usage[0]?.required).toBe(true);
    child.definition.parameters[0]!.required = false;
    child.definition.parameters[0]!.defaultValue = 'child-default';
    const defaults = configureTask(parent, [child]);
    expect(defaults.configured.usage[0]?.required).toBe(false);
    const compiled = compileStoredTask(defaults.configured, target, 'host', {});
    expect(compiled.plan.steps[0]?.task?.input).toEqual({
      url: 'child-default',
    });
    const explicit = compileStoredTask(defaults.configured, target, 'host', {
      mirror: '',
    });
    expect(explicit.plan.steps[0]?.task?.input).toEqual({ url: '' });
  });
  it('嵌套执行不占父并发槽，子任务与钩子完成后才放行依赖，参数保持独立', async () => {
    const { parent, child } = fixture();
    parent.definition.steps[1]!.dependsOn = ['a'];
    child.definition.hooks.finally.push({
      key: 'cleanup',
      title: 'cleanup',
      call: {
        kind: 'action',
        action: 'ssh.exec',
        input: SshScriptInput.parse({ script: 'cleanup' }),
      },
      timeoutMs: 1000,
    });
    const calls: { script: string; input: unknown }[] = [];
    const engine = new ExecutionService(
      new ActionRegistry().register({
        key: 'ssh.exec',
        execute: (input, context) => {
          calls.push({
            script: SshScriptInput.parse(input).script,
            input: context.taskInput,
          });
          return Promise.resolve(null);
        },
      }),
      new MemoryRunStore(),
      1,
    );
    try {
      const compiled = compileStoredTask(
        configureTask(parent, [child]).configured,
        target,
        'host',
        { mirror: 'supplied' },
      );
      const run = engine.submit(compiled.plan, { input: compiled.input });
      expect((await finished(engine, run.id)).status).toBe('succeeded');
      expect(calls.map((call) => call.script)).toEqual([
        'work',
        'cleanup',
        'work',
        'cleanup',
      ]);
      expect(
        calls.every(
          (call) => JSON.stringify(call.input) === '{"url":"supplied"}',
        ),
      ).toBe(true);
      expect(engine.tree(run.id).children).toHaveLength(2);
      expect(parent.definition.parameters[0]?.defaultValue).toBeUndefined();
    } finally {
      await engine.close();
    }
  });
  it('跳过步骤不调用主体或钩子，保留依赖顺序；子失败和取消向上传播', async () => {
    const { parent, child } = fixture();
    parent.definition.steps[1]!.dependsOn = ['a'];
    const seen: string[] = [];
    let running: ActionContext | undefined;
    const engine = new ExecutionService(
      new ActionRegistry().register({
        key: 'ssh.exec',
        execute: async (_input, context) => {
          running = context;
          seen.push(context.runId);
          await new Promise<void>((resolve) =>
            context.signal.addEventListener('abort', () => resolve(), {
              once: true,
            }),
          );
          return null;
        },
      }),
      new MemoryRunStore(),
      1,
    );
    try {
      const compiled = compileStoredTask(
        configureTask(parent, [child], ['steps.a']).configured,
        target,
        'host',
        { mirror: 'url' },
      );
      const run = engine.submit(compiled.plan, { input: compiled.input });
      await expect.poll(() => !!running).toBe(true);
      expect(engine.get(run.id).steps[0]?.status).toBe('skipped');
      engine.cancel(run.id);
      expect((await finished(engine, run.id)).status).toBe('cancelled');
      expect(
        engine
          .tree(run.id)
          .children.every((child) => isExecutionFinished(child.run.status)),
      ).toBe(true);
      expect(seen).toHaveLength(1);
    } finally {
      await engine.close();
    }
  });
  it('编译时预先拒绝深层缺参，避免父步骤已修改服务器才发现子任务配置错误', () => {
    const { parent, child } = fixture();
    expect(() =>
      compileStoredTask(
        configureTask(parent, [child]).configured,
        target,
        'host',
        {},
      ),
    ).toThrow('参数');
    expect(() =>
      Task.parse({
        ...parent,
        definition: {
          ...parent.definition,
          hooks: {
            before: [
              { key: 'bad', title: 'bad', call: script('x', ['missing']) },
            ],
          },
        },
      }),
    ).toThrow('未声明');
  });
});
