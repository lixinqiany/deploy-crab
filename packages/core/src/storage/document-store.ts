/** 可存储文档的最小形态：有一个稳定的字符串标识。 */
export interface Document {
  id: string;
}

/**
 * 读写文档时用来校验数据的 schema。
 * 只要求有 `parse` 方法：zod 的 schema 可以直接传入，core 本身不依赖 zod。
 */
export interface DocumentSchema<T> {
  parse(data: unknown): T;
}

/**
 * 文档的存储格式，各格式平级，没有默认值。
 * 一般而言：需要人阅读、手工编辑的数据用 `yaml`，程序生成的数据用 `json`。
 */
export type FormatName = 'yaml' | 'json';

/** 一个集合的完整描述：叫什么、数据长什么样、以什么格式保存。 */
export interface CollectionDefinition<T extends Document> {
  /** 集合名，同一个 store 里唯一 */
  name: string;
  schema: DocumentSchema<T>;
  /** 存储格式。不落盘的实现（例如内存）可以忽略它 */
  format: FormatName;
}

/**
 * 声明一个集合。原样返回传入的定义，作用只是让 TypeScript 从 schema 推断出 `T`。
 *
 * ```ts
 * export const HostCollection = defineCollection({
 *   name: 'hosts',
 *   schema: Host,
 *   format: 'yaml',
 * });
 * ```
 */
export function defineCollection<T extends Document>(
  definition: CollectionDefinition<T>,
): CollectionDefinition<T> {
  return definition;
}

/** 同一类文档的集合，例如全部主机。 */
export abstract class Collection<T extends Document> {
  abstract list(): Promise<T[]>;
  abstract get(id: string): Promise<T | undefined>;
  /** 新增或整体替换 */
  abstract put(document: T): Promise<void>;
  /** 返回是否确实删除了文档 */
  abstract delete(id: string): Promise<boolean>;
}

/**
 * 文档存储。业务代码只依赖这个抽象类，不关心数据存在哪里、用什么格式。
 *
 * 写成抽象类而不是 interface：interface 编译后不存在，抽象类在运行时仍然存在，
 * 可以直接作为 Nest 依赖注入的 token（`constructor(store: DocumentStore)`）。
 */
export abstract class DocumentStore {
  /**
   * 按定义取得集合。同一个集合名必须始终使用相同的格式，否则抛错；
   * 业务服务一般在构造时调用，这类错误会在应用启动时暴露。
   */
  abstract collection<T extends Document>(
    definition: CollectionDefinition<T>,
  ): Collection<T>;

  /**
   * 串行执行一组读写。「先检查再写入」的操作放在这里面，
   * 避免两个并发请求在检查和写入之间互相插入修改。
   */
  abstract exclusive<R>(task: () => Promise<R>): Promise<R>;
}
