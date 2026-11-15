import { readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { writeFileAtomic } from '../utils/atomic-write';
import { Mutex } from '../utils/mutex';
import type { DocumentFormat } from './document-format';
import {
  Collection,
  type CollectionDefinition,
  type Document,
  type DocumentSchema,
  DocumentStore,
  type FormatName,
} from './document-store';
import { JsonFormat } from './json-format';
import { YamlFormat } from './yaml-format';

/** 每种格式名对应的实现；`satisfies` 保证 `FormatName` 新增成员时这里不会漏 */
const FORMATS = {
  yaml: new YamlFormat(),
  json: new JsonFormat(),
} satisfies Record<FormatName, DocumentFormat>;

const KNOWN_EXTENSIONS: readonly string[] = Object.values(FORMATS).map(
  (format) => format.extension,
);

/** 集合名和文档 id 会直接拼进文件路径，只允许安全字符，防止 `../` 之类的路径穿越 */
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function assertSafeSegment(kind: string, value: string): void {
  if (!SAFE_SEGMENT.test(value)) {
    throw new Error(`Invalid ${kind}: ${JSON.stringify(value)}`);
  }
}

const isMissing = (error: unknown): boolean =>
  (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';

export type InvalidDocumentHandler = (file: string, error: unknown) => void;

export interface FileDocumentStoreOptions {
  /**
   * 遇到无法解析或不符合 schema 的文件时调用（例如被手工改坏）。
   * 该文件会被跳过，不影响读取其他文档。默认打印警告。
   */
  onInvalidDocument?: InvalidDocumentHandler;
}

/** 一个集合对应一个目录，每个文档一个 `<id><扩展名>` 文件 */
class FileCollection<T extends Document> extends Collection<T> {
  constructor(
    private readonly directory: string,
    private readonly schema: DocumentSchema<T>,
    private readonly format: DocumentFormat,
    private readonly onInvalid: InvalidDocumentHandler,
  ) {
    super();
  }

  async list(): Promise<T[]> {
    let entries: string[];
    try {
      entries = await readdir(this.directory);
    } catch (error) {
      // 集合目录在第一次写入时才创建，不存在就是空集合
      if (isMissing(error)) return [];
      throw error;
    }
    const documents = await Promise.all(
      entries
        .filter((entry) => this.accepts(entry))
        .map((entry) => this.read(join(this.directory, entry))),
    );
    return documents.filter((document) => document !== undefined);
  }

  // 声明为 async：id 非法时以被拒绝的 Promise 报错，而不是同步抛出
  async get(id: string): Promise<T | undefined> {
    return this.read(this.fileOf(id));
  }

  async put(document: T): Promise<void> {
    // 写入前也校验一次，保证磁盘上的数据始终符合 schema
    const valid = this.schema.parse(document);
    await writeFileAtomic(this.fileOf(valid.id), this.format.stringify(valid));
  }

  async delete(id: string): Promise<boolean> {
    try {
      await rm(this.fileOf(id));
      return true;
    } catch (error) {
      if (isMissing(error)) return false;
      throw error;
    }
  }

  /**
   * 只读取本集合格式的文件。其他已知格式的文件多半是集合改过格式后留下的旧数据，
   * 跳过并上报，避免数据看起来「凭空消失」；迁移交给人处理。
   */
  private accepts(entry: string): boolean {
    if (entry.endsWith(this.format.extension)) return true;
    const foreign = KNOWN_EXTENSIONS.find((extension) =>
      entry.endsWith(extension),
    );
    if (foreign) {
      this.onInvalid(
        join(this.directory, entry),
        new Error(
          `File format ${foreign} does not match collection format ${this.format.extension}`,
        ),
      );
    }
    return false;
  }

  private fileOf(id: string): string {
    assertSafeSegment('document id', id);
    return join(this.directory, `${id}${this.format.extension}`);
  }

  private async read(file: string): Promise<T | undefined> {
    let content: string;
    try {
      content = await readFile(file, 'utf8');
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
    try {
      return this.schema.parse(this.format.parse(content));
    } catch (error) {
      this.onInvalid(file, error);
      return undefined;
    }
  }
}

/**
 * 基于文件的文档存储，每个集合的文件格式由它的定义决定：
 *
 * ```text
 * <root>/
 * ├── hosts/<id>.yaml
 * └── sessions/<id>.json
 * ```
 *
 * 文件可以直接阅读和手工编辑，写入是原子的。
 * 同一个数据目录只应由一个进程写入，`exclusive` 只能保证进程内串行。
 */
export class FileDocumentStore extends DocumentStore {
  readonly #mutex = new Mutex();
  readonly #onInvalid: InvalidDocumentHandler;
  /** 已经取用过的集合及其格式，用来发现同名集合声明了不同格式 */
  readonly #formats = new Map<string, FormatName>();

  constructor(
    private readonly root: string,
    options: FileDocumentStoreOptions = {},
  ) {
    super();
    this.#onInvalid =
      options.onInvalidDocument ??
      ((file, error) =>
        console.warn(`Skipped invalid document ${file}:`, error));
  }

  collection<T extends Document>({
    name,
    schema,
    format,
  }: CollectionDefinition<T>): Collection<T> {
    assertSafeSegment('collection name', name);
    const registered = this.#formats.get(name);
    if (registered !== undefined && registered !== format) {
      throw new Error(
        `Collection ${JSON.stringify(name)} is already used with format ${registered}, cannot use ${format}`,
      );
    }
    this.#formats.set(name, format);
    return new FileCollection(
      join(this.root, name),
      schema,
      FORMATS[format],
      this.#onInvalid,
    );
  }

  exclusive<R>(task: () => Promise<R>): Promise<R> {
    return this.#mutex.run(task);
  }
}
