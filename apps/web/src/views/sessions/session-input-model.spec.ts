import { describe, expect, it } from 'vitest';
import { Task } from '@deploy-crab/contracts/task';
import { configureTask } from '@deploy-crab/contracts/task-configuration';
import { resolveSessionFields } from './session-input-model';

it('跳过后忽略隐藏字段的无效草稿，恢复后继续校验且内容不丢失', () => {
  const task = Task.parse({
    id: '00000000-0000-4000-8000-000000000001',
    name: 'task',
    revision: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    definition: {
      parameters: [{ name: 'data', type: 'json', required: true }],
      steps: [
        {
          id: 'work',
          title: 'work',
          skippable: true,
          call: {
            kind: 'action',
            action: 'ssh.exec',
            input: { script: 'work' },
            usesInputs: ['data'],
          },
        },
      ],
    },
  });
  const fields = { data: '{' };
  expect(
    resolveSessionFields(configureTask(task, []).configured, fields).errors
      .data,
  ).toContain('JSON');
  expect(
    resolveSessionFields(
      configureTask(task, [], ['steps.work']).configured,
      fields,
    ),
  ).toEqual({ input: {}, errors: {} });
  expect(fields.data).toBe('{');
  expect(
    resolveSessionFields(configureTask(task, []).configured, fields).errors
      .data,
  ).toContain('JSON');
});

describe('本次参数值', () => {
  it('保留 false、0、空字符串，不把默认值写回配置', () => {
    const task = Task.parse({
      id: '00000000-0000-4000-8000-000000000001',
      name: 'task',
      revision: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      definition: {
        parameters: [
          { name: 'flag', type: 'boolean' },
          { name: 'count', type: 'number' },
          { name: 'text', defaultValue: 'default' },
        ],
        steps: [
          {
            id: 'work',
            title: 'work',
            call: {
              kind: 'action',
              action: 'ssh.exec',
              input: { script: 'work' },
            },
          },
        ],
      },
    });
    const config = configureTask(task, []).configured;
    expect(
      resolveSessionFields(config, { flag: 'false', count: '0', text: '' }),
    ).toEqual({ input: { flag: false, count: 0, text: '' }, errors: {} });
    expect(resolveSessionFields(config, {})).toEqual({ input: {}, errors: {} });
  });
});
