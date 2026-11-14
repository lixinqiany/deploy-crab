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
  abstract collection<T extends Document>(
    name: string,
    schema: DocumentSchema<T>,
  ): Collection<T>;

  /**
   * 串行执行一组读写。「先检查再写入」的操作放在这里面，
   * 避免两个并发请求在检查和写入之间互相插入修改。
   */
  abstract exclusive<R>(task: () => Promise<R>): Promise<R>;
}
