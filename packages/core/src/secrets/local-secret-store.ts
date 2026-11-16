import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { CreateSecret, SecretSummary } from '@deploy-crab/contracts/secret';
import { ConflictError, NotFoundError } from '../errors/domain-error';

interface Entry {
  summary: SecretSummary;
  iv: string;
  tag: string;
  ciphertext: string;
}

/** 本机凭据库。数据库及执行快照仅保存 ID；主密钥与密文均只允许服务用户读取。 */
export class LocalSecretStore {
  private readonly directory: string;
  private readonly filename: string;
  constructor(dataDirectory: string) {
    this.directory = join(dataDirectory, 'credentials');
    this.filename = join(this.directory, 'store.json');
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    chmodSync(this.directory, 0o700);
  }
  private key(): Buffer {
    const path = join(this.directory, 'master.key');
    if (!existsSync(path)) {
      if (existsSync(this.filename))
        throw new Error('凭据主密钥丢失，无法解密；请恢复凭据目录备份');
      try {
        writeFileSync(path, randomBytes(32), { mode: 0o600, flag: 'wx' });
      } catch (error) {
        if (!existsSync(path)) throw error;
      }
    }
    chmodSync(path, 0o600);
    const key = readFileSync(path);
    if (key.length !== 32) throw new Error('凭据主密钥无效');
    return key;
  }
  private entries(): Entry[] {
    if (!existsSync(this.filename)) return [];
    return JSON.parse(readFileSync(this.filename, 'utf8')) as Entry[];
  }
  list(): SecretSummary[] {
    return this.entries().map((entry) => SecretSummary.parse(entry.summary));
  }
  create(input: CreateSecret): SecretSummary {
    const body = CreateSecret.parse(input),
      entries = this.entries();
    if (entries.some((entry) => entry.summary.name === body.name))
      throw new ConflictError('凭据名称已存在');
    const summary = {
      id: randomUUID(),
      name: body.name,
      createdAt: new Date().toISOString(),
    };
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    cipher.setAAD(Buffer.from(summary.id));
    const ciphertext = Buffer.concat([
      cipher.update(body.value ?? randomBytes(48).toString('base64'), 'utf8'),
      cipher.final(),
    ]);
    entries.push({
      summary,
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    });
    const temporary = `${this.filename}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(entries), {
      mode: 0o600,
      flag: 'wx',
    });
    renameSync(temporary, this.filename);
    return summary;
  }
  resolve(id: string): string {
    const entry = this.entries().find((item) => item.summary.id === id);
    if (!entry) throw new NotFoundError('凭据不存在，请重新选择');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key(),
      Buffer.from(entry.iv, 'base64'),
    );
    decipher.setAAD(Buffer.from(id));
    decipher.setAuthTag(Buffer.from(entry.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(entry.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
