/**
 * 文档的文件格式：决定文件扩展名，以及文本和对象之间怎么互相转换。
 *
 * `FileDocumentStore` 的其他逻辑（目录布局、原子写入、校验）与格式无关，
 * 新增一种格式只需要再实现一个子类。
 */
export abstract class DocumentFormat {
  /** 文件扩展名，包含开头的点，例如 `.yaml` */
  abstract readonly extension: string;

  /** 把文件内容解析成对象；内容不合法时抛错 */
  abstract parse(text: string): unknown;

  /** 把对象序列化成文件内容 */
  abstract stringify(value: unknown): string;
}
