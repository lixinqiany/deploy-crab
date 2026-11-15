import { DocumentFormat } from './document-format';

/** JSON 格式：适合程序生成的数据 */
export class JsonFormat extends DocumentFormat {
  readonly extension = '.json';

  parse(text: string): unknown {
    return JSON.parse(text);
  }

  // 缩进并以换行结尾：偶尔打开查看时可读，git diff 也更干净
  stringify(value: unknown): string {
    return `${JSON.stringify(value, null, 2)}\n`;
  }
}
