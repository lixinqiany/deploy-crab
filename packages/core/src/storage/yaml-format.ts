import { parse, stringify } from 'yaml';
import { DocumentFormat } from './document-format';

/** YAML 格式：便于人阅读和手工编辑 */
export class YamlFormat extends DocumentFormat {
  readonly extension = '.yaml';

  parse(text: string): unknown {
    return parse(text);
  }

  stringify(value: unknown): string {
    return stringify(value);
  }
}
