import { TaskCall } from '@deploy-crab/contracts/task';
import {
  TaskParameters,
  type TaskInput,
} from '@deploy-crab/contracts/task-input';
import {
  resolveTaskInputMapping,
  validateTaskInputMapping,
} from '@deploy-crab/contracts/task-input-bindings';
import { describe, expect, it } from 'vitest';

const parent = TaskParameters.parse([{ name: 'dockerMirrorUrl' }]);
const child = TaskParameters.parse([
  { name: 'mirrorUrl', defaultValue: 'child-default' },
]);
const mapping = {
  inputBindings: {
    mirrorUrl: { from: 'taskInput' as const, key: 'dockerMirrorUrl' },
  },
};

describe('任务引用参数绑定', () => {
  it('调用值覆盖父默认值再传给子任务；缺值才使用子默认值，不隐式同名继承', () => {
    const withDefault = TaskParameters.parse([
      { name: 'dockerMirrorUrl', defaultValue: 'parent-default' },
    ]);
    expect(resolveTaskInputMapping(parent, child, mapping)).toEqual({
      input: { mirrorUrl: 'child-default' },
      issues: [],
    });
    expect(resolveTaskInputMapping(withDefault, child, mapping).input).toEqual({
      mirrorUrl: 'parent-default',
    });
    expect(
      resolveTaskInputMapping(withDefault, child, mapping, {
        dockerMirrorUrl: 'override',
      }).input,
    ).toEqual({ mirrorUrl: 'override' });
    expect(
      resolveTaskInputMapping(child, child, {}, { mirrorUrl: 'do-not-inherit' })
        .input,
    ).toEqual({ mirrorUrl: 'child-default' });
    expect(child[0]!.defaultValue).toBe('child-default');
    expect(mapping).toEqual({
      inputBindings: {
        mirrorUrl: { from: 'taskInput', key: 'dockerMirrorUrl' },
      },
    });
  });

  it('绑定按声明检查；运行时才校验实际必填值和类型', () => {
    const requiredChild = TaskParameters.parse([
      { name: 'mirrorUrl', required: true },
    ]);
    expect(
      validateTaskInputMapping(parent, requiredChild, mapping).issues,
    ).toEqual([]);
    expect(
      resolveTaskInputMapping(parent, requiredChild, mapping).issues[0]
        ?.message,
    ).toContain('必填');
    expect(
      resolveTaskInputMapping(parent, requiredChild, mapping, {
        dockerMirrorUrl: '',
      }).issues[0]?.message,
    ).toContain('不能为空');
    expect(
      resolveTaskInputMapping(parent, child, mapping, { dockerMirrorUrl: 5 })
        .issues[0]?.message,
    ).toContain('当前任务');
    const requiredParent = TaskParameters.parse([
      { name: 'dockerMirrorUrl', required: true },
    ]);
    expect(
      validateTaskInputMapping(requiredParent, requiredChild, mapping).issues,
    ).toEqual([]);
    expect(
      resolveTaskInputMapping(requiredParent, requiredChild, mapping).issues[0]
        ?.message,
    ).toContain('当前任务');
  });

  it.each([
    ['boolean', false],
    ['number', 0],
    ['string', ''],
    ['json', null],
  ] as const)('保留 %s 的显式值，不被默认值覆盖', (type, value) => {
    const sources = TaskParameters.parse([{ name: 'value', type }]);
    const targets = TaskParameters.parse([
      { name: 'value', type: 'json', defaultValue: 'fallback' },
    ]);
    expect(
      resolveTaskInputMapping(
        sources,
        targets,
        { inputBindings: { value: { from: 'taskInput', key: 'value' } } },
        { value },
      ),
    ).toEqual({ input: { value }, issues: [] });
  });

  it('JSON 固定值不当成表达式；解析结果不共享对象，多层引用逐层传值', () => {
    const params = TaskParameters.parse([{ name: 'value', type: 'json' }]);
    const literal = { from: 'taskInput', key: 'not-an-expression' };
    expect(
      resolveTaskInputMapping([], params, { input: { value: literal } }).input
        .value,
    ).toEqual(literal);
    const provided = { value: { nested: [0] } };
    const bind = {
      inputBindings: { value: { from: 'taskInput' as const, key: 'value' } },
    };
    const first = resolveTaskInputMapping(params, params, bind, provided);
    const second = resolveTaskInputMapping(params, params, bind, first.input);
    expect(second.input).toEqual(provided);
    expect(first.input.value).not.toBe(provided.value);
    expect(second.input.value).not.toBe(first.input.value);
    expect(resolveTaskInputMapping(params, params, {}, provided).input).toEqual(
      {},
    );
  });

  it('拒绝未知来源、目标、类型和双重赋值；任意 JSON 不能绑定到特定标量类型', () => {
    expect(
      validateTaskInputMapping([], child, mapping).issues[0]?.message,
    ).toContain('当前任务未声明');
    expect(
      validateTaskInputMapping(parent, [], mapping).issues[0]?.message,
    ).toContain('未声明参数');
    for (const type of ['number', 'json'] as const)
      expect(
        validateTaskInputMapping(
          TaskParameters.parse([{ name: 'dockerMirrorUrl', type }]),
          child,
          mapping,
        ).issues[0]?.message,
      ).toContain('类型不兼容');
    const ambiguous = { ...mapping, input: { mirrorUrl: 'fixed' } };
    expect(
      validateTaskInputMapping(parent, child, ambiguous).issues[0]?.message,
    ).toContain('同时');
    const call = {
      kind: 'task',
      taskId: '00000000-0000-4000-8000-000000000001',
      ...ambiguous,
    };
    expect(TaskCall.safeParse(call).success).toBe(false);
    for (const binding of [
      { from: 'env', key: 'dockerMirrorUrl' },
      { from: 'taskInput', key: '__proto__' },
      { from: 'taskInput', key: '' },
    ])
      expect(
        TaskCall.safeParse({
          ...call,
          input: {},
          inputBindings: { mirrorUrl: binding },
        }).success,
      ).toBe(false);
  });

  it('映射展开和子默认值合并后仍受参数大小限制', () => {
    const source = TaskParameters.parse([{ name: 'value' }]);
    const target = TaskParameters.parse([{ name: 'a' }, { name: 'b' }]);
    const input: TaskInput = { value: 'x'.repeat(9000) };
    const result = resolveTaskInputMapping(
      source,
      target,
      {
        inputBindings: {
          a: { from: 'taskInput', key: 'value' },
          b: { from: 'taskInput', key: 'value' },
        },
      },
      input,
    );
    expect(result.issues).not.toEqual([]);
    const defaults = TaskParameters.parse([
      { name: 'a' },
      { name: 'b', defaultValue: 'x'.repeat(9000) },
    ]);
    expect(
      resolveTaskInputMapping(
        source,
        defaults,
        { inputBindings: { a: { from: 'taskInput', key: 'value' } } },
        input,
      ).issues,
    ).not.toEqual([]);
  });
});
