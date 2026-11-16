import { TaskDefinition, type Task } from '@deploy-crab/contracts/task';
import { TaskParameters } from '@deploy-crab/contracts/task-input';
import { describe, expect, it } from 'vitest';
import {
  inputFieldDraft,
  resolveCallInput,
  resolveInputDrafts,
  type InputFieldDraft,
} from './task-input-model';
import {
  parameterDraft,
  resolveParameterDrafts,
  taskInputExample,
} from './parameter-editor-model';
import { matchesTask } from './task-editor-model';

const parameters = TaskParameters.parse([
  { name: 'url', required: true },
  { name: 'enabled', type: 'boolean', defaultValue: true },
  { name: 'count', type: 'number' },
  { name: 'data', type: 'json' },
]);
const child: Task = {
  id: '00000000-0000-4000-8000-000000000001',
  name: '配置 Docker',
  description: '软件源配置',
  labels: ['安装', '容器'],
  sourceUrl: null,
  revision: 1,
  createdAt: '2026-11-16T00:00:00.000Z',
  updatedAt: '2026-11-16T00:00:00.000Z',
  definition: TaskDefinition.parse({
    parameters,
    steps: [
      {
        id: 'script',
        title: '执行脚本',
        call: {
          kind: 'action',
          action: 'ssh.exec',
          input: { script: 'echo ready' },
        },
      },
    ],
  }),
};
const reference = {
  kind: 'task' as const,
  taskId: child.id,
  input: { url: 'https://example.test' },
};
const literal = (text: string): InputFieldDraft => ({
  mode: 'value',
  text,
  sourceKey: '',
});
const bound = (sourceKey: string): InputFieldDraft => ({
  mode: 'binding',
  text: '',
  sourceKey,
});
const omitted: InputFieldDraft = { mode: 'omit', text: '', sourceKey: '' };
const definition = () =>
  TaskDefinition.parse({
    steps: [
      {
        id: 'first',
        title: '第一步',
        call: reference,
        hooks: {
          finally: [{ key: 'cleanup', title: '收尾', call: reference }],
        },
      },
      { id: 'second', title: '第二步', call: reference },
    ],
    hooks: { before: [{ key: 'prepare', title: '准备', call: reference }] },
  });

describe('任务参数表单', () => {
  it('不填必填值会报错；可选字段留空时不固化默认值', () => {
    expect(resolveCallInput(parameters).errors.url).toContain('必填');
    expect(
      resolveCallInput(
        parameters,
        {},
        { url: literal('https://example.test') },
      ),
    ).toEqual({
      input: { url: 'https://example.test' },
      inputBindings: {},
      errors: {},
    });
  });
  it('保留 false、0 和嵌套 JSON，空白必填字符串无效', () => {
    expect(
      resolveCallInput(
        parameters,
        {},
        {
          url: literal(' '),
          enabled: literal('false'),
          count: literal('0'),
          data: literal('[null,{"empty":""}]'),
        },
      ),
    ).toEqual({
      input: {
        url: ' ',
        enabled: false,
        count: 0,
        data: [null, { empty: '' }],
      },
      inputBindings: {},
      errors: { url: '必填参数「url」不能为空' },
    });
  });
  it('步骤和两层钩子分别解析；未完成的 JSON 不会静默保存', () => {
    const source = definition();
    const drafts = {
      'steps.first.call': { data: literal('{') },
      'steps.first.hooks.finally.cleanup': { count: literal('0') },
      'hooks.before.prepare': { enabled: literal('false') },
    };
    const resolved = resolveInputDrafts(source, drafts, [child]);
    expect(resolved.errors).toEqual(['第一步：请填写合法的 JSON']);
    expect(resolved.definition.steps[0]?.hooks.finally[0]?.call).toMatchObject({
      input: { count: 0 },
    });
    expect(resolved.definition.hooks.before[0]?.call).toMatchObject({
      input: { enabled: false },
    });
    expect(source).toEqual(definition());
    source.steps.shift();
    expect(resolveInputDrafts(source, drafts, [child]).errors).toEqual([]);
    expect(drafts['steps.first.call'].data.text).toBe('{');
  });
  it('清空覆盖值恢复默认规则，不允许未声明字段和错误类型', () => {
    expect(
      resolveCallInput(
        parameters,
        { input: { url: 'x', enabled: false } },
        { enabled: omitted },
      ).input,
    ).toEqual({ url: 'x' });
    expect(
      resolveCallInput(parameters, { input: { url: 'x', typo: 1 } }).errors
        .typo,
    ).toContain('未声明');
    expect(
      resolveCallInput(
        parameters,
        { input: { url: 'x' } },
        { count: literal('"3"') },
      ).errors.count,
    ).toContain('数字');
    expect(
      resolveCallInput(
        parameters,
        { input: { url: 'x', legacy: true } },
        { legacy: omitted },
      ).errors,
    ).toEqual({});
  });
  it('绑定、固定值和不传值互斥，切换不丢失原始草稿，空字符串是显式固定值', () => {
    const parents = TaskParameters.parse([{ name: 'source' }]);
    const mapping = { input: { url: 'old' } };
    const field = { ...literal('new'), ...bound('source'), text: 'new' };
    const bindings = resolveCallInput(
      parameters,
      mapping,
      { url: field },
      parents,
    );
    expect(bindings).toEqual({
      input: {},
      inputBindings: { url: { from: 'taskInput', key: 'source' } },
      errors: {},
    });
    expect(
      resolveCallInput(
        parameters,
        bindings,
        { url: { ...field, mode: 'value' } },
        parents,
      ).input,
    ).toEqual({ url: 'new' });
    expect(
      resolveCallInput(parameters, bindings, { url: omitted }, parents).errors
        .url,
    ).toContain('必填');
    expect(
      resolveCallInput(parameters, mapping, { url: bound('') }, parents).errors
        .url,
    ).toContain('请选择');
    const optional = TaskParameters.parse([
      { name: 'url', defaultValue: 'fallback' },
    ]);
    expect(resolveCallInput(optional, {}, { url: literal('') }).input).toEqual({
      url: '',
    });
    expect(inputFieldDraft(optional[0]!, bindings)).toEqual(bound('source'));
    expect(field.text).toBe('new');
  });
  it('绑定保存覆盖所有引用位置，使用当前父参数声明且不固化默认值', () => {
    const source = definition();
    source.parameters = TaskParameters.parse([
      { name: 'source', required: true },
    ]);
    const drafts = {
      'steps.first.call': { url: bound('source') },
      'steps.first.hooks.finally.cleanup': { url: bound('source') },
      'hooks.before.prepare': { url: bound('source') },
    };
    const resolved = resolveInputDrafts(source, drafts, [child]);
    expect(resolved.errors).toEqual([]);
    for (const call of [
      resolved.definition.steps[0]!.call,
      resolved.definition.steps[0]!.hooks.finally[0]!.call,
      resolved.definition.hooks.before[0]!.call,
    ])
      expect(call).toEqual({
        kind: 'task',
        taskId: child.id,
        input: {},
        inputBindings: { url: { from: 'taskInput', key: 'source' } },
      });
    expect(resolveInputDrafts(resolved.definition, {}, [child])).toEqual(
      resolved,
    );
    source.parameters[0]!.name = 'renamed';
    expect(resolveInputDrafts(source, drafts, [child]).errors).toHaveLength(3);
    source.parameters = TaskParameters.parse([
      { name: 'source', type: 'number' },
    ]);
    expect(resolveInputDrafts(source, drafts, [child]).errors[0]).toContain(
      '类型不兼容',
    );
    const stale = {
      inputBindings: { removed: { from: 'taskInput' as const, key: 'source' } },
    };
    expect(resolveCallInput([], stale, { removed: omitted }).errors).toEqual(
      {},
    );
  });
  it('参数定义卡保留默认值草稿，重复字段和非法默认值禁止保存', () => {
    const first = {
      ...parameterDraft(),
      name: 'url',
      hasDefault: true,
      defaultText: 'https://example.test',
    };
    const second = {
      ...parameterDraft(),
      name: 'data',
      type: 'json' as const,
      hasDefault: true,
      defaultText: '{',
    };
    expect(resolveParameterDrafts([first, second]).errors).toContain(
      '参数 2 默认值：请填写合法的 JSON',
    );
    expect(
      resolveParameterDrafts([first, { ...first, key: 'copy' }]).errors,
    ).toContain('参数 2：参数名不能重复');
    expect(resolveParameterDrafts([first]).parameters[0]?.defaultValue).toBe(
      'https://example.test',
    );
    expect(
      resolveParameterDrafts([
        { ...first, name: 'a', defaultText: 'x'.repeat(9000) },
        { ...first, key: 'second', name: 'b', defaultText: 'x'.repeat(9000) },
      ]).errors,
    ).toContain('任务参数：所有参数默认值合计最多 16000 个字符');
  });
  it('脚本示例反映当前参数，名称按字符串转义，搜索匹配标签和关键词', () => {
    expect(taskInputExample(parameters)).toContain('print(inputs["url"])');
    expect(taskInputExample(parameters)).toContain(
      'print(inputs.get("enabled"))',
    );
    expect(
      taskInputExample([{ ...parameters[0]!, name: 'bad"name' }]),
    ).toContain('"bad\\"name"');
    expect(matchesTask(child, '安装')).toBe(true);
    expect(matchesTask(child, 'docker 安装')).toBe(true);
    expect(matchesTask(child, '数据库')).toBe(false);
  });
});
