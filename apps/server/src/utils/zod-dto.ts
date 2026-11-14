import type { z, ZodType } from 'zod';

/**
 * 带 zod schema 的 DTO 基类。
 *
 * Controller 参数的类型写成它的子类，全局的 `ZodValidationPipe`
 * 就会用类上的 `schema` 校验这个参数；类型不是它的子类的参数原样放行。
 *
 * 子类不要直接继承它，而是用 `createZodDto(schema)` 生成：
 *
 * ```ts
 * export class CreateHostDto extends createZodDto(CreateHostInput) {}
 * ```
 */
export abstract class ZodDto {
  // 静态成员不能声明为 abstract，用 declare 只声明类型、不生成字段
  declare static readonly schema: ZodType;
}

/** `createZodDto` 返回的类：实例类型是 schema 的输出类型，类上带着 schema */
export type ZodDtoClass<S extends ZodType> =
  (abstract new () => z.output<S>) & {
    readonly schema: S;
  };

/**
 * 根据 schema 生成 DTO 基类，类型和校验规则都来自同一个 schema。
 *
 * 注意：pipe 返回的是 schema 解析后的普通对象，不是 DTO 的实例，
 * 所以 DTO 类里不要写方法或字段，只用它来标注类型。
 */
export function createZodDto<S extends ZodType>(schema: S): ZodDtoClass<S> {
  abstract class SchemaDto extends ZodDto {
    static override readonly schema = schema;
  }
  return SchemaDto as unknown as ZodDtoClass<S>;
}

/** 判断参数类型是不是 ZodDto 的子类 */
export function isZodDto(metatype: unknown): metatype is typeof ZodDto {
  return typeof metatype === 'function' && metatype.prototype instanceof ZodDto;
}
