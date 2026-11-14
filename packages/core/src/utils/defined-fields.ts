/**
 * 每个字段都可以省略，但出现时值不是 undefined。
 *
 * 例如 `{ name?: string | undefined }` → `{ name?: string }`。
 * 开启 `exactOptionalPropertyTypes` 后，这两种写法是不同的类型。
 */
export type DefinedFields<T> = { [K in keyof T]?: Exclude<T[K], undefined> };

/**
 * 去掉值为 undefined 的字段，`null` 等其他值保留。
 *
 * 用于部分更新：`{ ...current, ...definedFields(input) }`，
 * 避免没有传值的字段把已有值覆盖成 undefined。
 */
export function definedFields<T extends object>(input: T): DefinedFields<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as DefinedFields<T>;
}
