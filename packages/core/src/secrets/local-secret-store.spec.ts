import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LocalSecretStore } from './local-secret-store';
import { secretRedactor } from './redact';

describe('本机凭据', () => {
  it('密文保存、列表只返回元数据、重启可读取，篡改密文无法解密', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deploy-crab-secrets-'));
    try {
      const store = new LocalSecretStore(directory),
        password = 'test-password-123456';
      const created = store.create({ name: 'test', value: password });
      const filename = join(directory, 'credentials/store.json');
      expect(readFileSync(filename, 'utf8')).not.toContain(password);
      expect(JSON.stringify(store.list())).not.toContain(password);
      expect(statSync(filename).mode & 0o777).toBe(0o600);
      expect(
        statSync(join(directory, 'credentials/master.key')).mode & 0o777,
      ).toBe(0o600);
      expect(new LocalSecretStore(directory).resolve(created.id)).toBe(
        password,
      );
      expect(() => store.create({ name: 'test' })).toThrow('已存在');
      const entries = JSON.parse(readFileSync(filename, 'utf8')) as {
        tag: string;
      }[];
      entries[0]!.tag = Buffer.alloc(16).toString('base64');
      writeFileSync(filename, JSON.stringify(entries));
      expect(() => store.resolve(created.id)).toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('凭据跨日志分块或包含 JSON 转义时仍被遮盖', () => {
    const secret = 'a-long-secret-with-quote"1234';
    for (let split = 0; split <= secret.length; split++) {
      let result = '';
      const redactor = secretRedactor([secret], (text) => {
        result += text;
      });
      redactor.write('before:' + secret.slice(0, split));
      redactor.write(secret.slice(split) + ':after:' + JSON.stringify(secret));
      redactor.end();
      expect(result).toBe('before:[已隐藏]:after:"[已隐藏]"');
    }
  });
  it('一份凭据是另一份的前缀时，等待后续分块再匹配较长凭据', () => {
    let output = '';
    const redactor = secretRedactor(
      ['short-secret', 'short-secret-longer'],
      (text) => {
        output += text;
      },
    );
    redactor.write('short-secret');
    redactor.write('-longer and short-secret');
    redactor.end();
    expect(output).toBe('[已隐藏] and [已隐藏]');
  });
});
