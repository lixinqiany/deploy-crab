import { describe, expect, it } from 'vitest';
import { definedFields } from './defined-fields';

describe('definedFields', () => {
  it('去掉值为 undefined 的字段，保留 null、0、空字符串等', () => {
    expect(
      definedFields({ a: undefined, b: null, c: 0, d: '', e: false }),
    ).toEqual({ b: null, c: 0, d: '', e: false });
  });

  it('展开到已有对象上时，没有传值的字段保留原值', () => {
    const current = { name: 'web-1', port: 22 };
    const input = { name: undefined, port: 2222 };

    expect({ ...current, ...definedFields(input) }).toEqual({
      name: 'web-1',
      port: 2222,
    });
  });
});
