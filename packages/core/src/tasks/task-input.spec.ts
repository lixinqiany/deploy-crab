import { TaskDefinition } from '@deploy-crab/contracts/task';
import {
  TaskParameters,
  resolveTaskInput,
} from '@deploy-crab/contracts/task-input';
import { describe, expect, it } from 'vitest';

describe('任务参数契约', () => {
  it('旧定义没有 parameters 时按空数组读取', () => {
    expect(
      TaskDefinition.parse({
        steps: [
          {
            id: 'probe',
            title: '检查',
            call: { kind: 'action', action: 'ssh.probe' },
          },
        ],
      }).parameters,
    ).toEqual([]);
  });
  it('拒绝重复名、无效标识、类型不匹配的默认值，以及必填和默认值并存', () => {
    for (const definitions of [
      [{ name: 'a' }, { name: 'a' }],
      [{ name: 'a.b' }],
      [{ name: '__proto__' }],
      [{ name: 'flag', type: 'boolean', defaultValue: 'false' }],
      [{ name: 'url', required: true, defaultValue: 'x' }],
    ])
      expect(TaskParameters.safeParse(definitions).success).toBe(false);
  });
  it('必填项缺失、空字符串和 null 无效，false 和 0 有效', () => {
    const definitions = TaskParameters.parse([
      { name: 'text', required: true },
      { name: 'flag', type: 'boolean', required: true },
      { name: 'count', type: 'number', required: true },
      { name: 'data', type: 'json', required: true },
    ]);
    expect(resolveTaskInput(definitions).issues).toHaveLength(4);
    expect(
      resolveTaskInput(definitions, {
        text: ' ',
        flag: false,
        count: 0,
        data: null,
      }).issues.map((issue) => issue.name),
    ).toEqual(['text', 'data']);
    expect(
      resolveTaskInput(definitions, {
        text: 'ready',
        flag: false,
        count: 0,
        data: [],
      }).issues,
    ).toEqual([]);
  });
  it('合并默认值但不改变调用值和声明；未知字段与超出大小限制会报错', () => {
    const definitions = TaskParameters.parse([
      { name: 'config', type: 'json', defaultValue: { list: [1] } },
      { name: 'text' },
    ]);
    const provided = { text: 'hello' };
    const first = resolveTaskInput(definitions, provided);
    expect(first.input).toEqual({ text: 'hello', config: { list: [1] } });
    const config = first.input.config;
    if (config && typeof config === 'object' && !Array.isArray(config))
      config.list = [2];
    expect(resolveTaskInput(definitions, provided).input.config).toEqual({
      list: [1],
    });
    expect(provided).toEqual({ text: 'hello' });
    expect(resolveTaskInput(definitions, { typo: 'x' }).issues[0]?.name).toBe(
      'typo',
    );
    expect(
      resolveTaskInput(definitions, { text: 'x'.repeat(16_000) }).issues.length,
    ).toBeGreaterThan(0);
  });
});
