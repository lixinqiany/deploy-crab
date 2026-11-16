import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CheckHostInput,
  type ConnectionTarget,
} from '@deploy-crab/contracts/connection';
import { describe, expect, it } from 'vitest';
import { ExecutionFailure } from '../execution/execution-failure';
import { OpenSshRunner, openSshConfig } from './open-ssh-runner';

const target = (): ConnectionTarget => ({
  hostId: null,
  endpoint: {
    address: '127.0.0.1',
    port: 22,
    user: 'deploy',
    auth: { method: 'agent' },
  },
  jumps: [],
});
const hasSsh = spawnSync('ssh', ['-V']).status === 0;
const gate = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('OpenSshRunner', () => {
  it('执行入口拒绝 shell/config 注入', () => {
    for (const address of [
      '-oProxyCommand=evil',
      'host;evil',
      '$(evil)',
      'a\nHost *',
    ]) {
      expect(() =>
        openSshConfig({
          ...target(),
          endpoint: { ...target().endpoint, address },
        }),
      ).toThrow();
    }
    expect(
      CheckHostInput.safeParse({ publicAddress: 'localhost', user: '$(evil)' })
        .success,
    ).toBe(false);
    expect(
      CheckHostInput.safeParse({
        publicAddress: 'localhost',
        user: 'deploy',
        auth: { method: 'key', keyPath: '/tmp/key\nProxyCommand evil' },
      }).success,
    ).toBe(false);
  });

  it.skipIf(!hasSsh)(
    '生成配置可被 OpenSSH 解析，多跳各自使用指定的身份',
    async () => {
      const directory = await mkdtemp(
        join(tmpdir(), 'deploy-crab-ssh-config-test-'),
      );
      try {
        const connection = target();
        connection.endpoint.auth = {
          method: 'key',
          keyPath: '/tmp/key with spaces',
        };
        connection.jumps = [
          {
            ...connection.endpoint,
            address: '192.0.2.1',
            port: 2222,
            auth: { method: 'agent' },
          },
          {
            ...connection.endpoint,
            address: '10.0.0.1',
            auth: { method: 'key', keyPath: '/tmp/jump-key' },
          },
        ];
        const path = join(directory, 'config');
        await writeFile(path, openSshConfig(connection));
        for (const [index, identity] of [
          'none',
          '/tmp/jump-key',
          '/tmp/key with spaces',
        ].entries()) {
          const parsed = spawnSync('ssh', ['-G', '-F', path, `crab-${index}`], {
            encoding: 'utf8',
          });
          expect(parsed.status, parsed.stderr).toBe(0);
          expect(parsed.stdout).toContain(`identityfile ${identity}\n`);
          expect(parsed.stdout).toContain('stricthostkeychecking true\n');
          expect(parsed.stdout).toContain('batchmode yes\n');
          if (index)
            expect(parsed.stdout).toContain(`proxyjump crab-${index - 1}\n`);
        }
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  it.skipIf(!hasSsh)(
    '取消真实 SSH 子进程后关闭本地 TCP 连接，并保留取消原因',
    async () => {
      const accepted = gate();
      const closed = gate();
      const sockets = new Set<Socket>();
      const server = createServer((socket) => {
        sockets.add(socket);
        socket.on('data', () => {
          /* 接收客户端 banner，故意不回复 SSH 握手。 */
        });
        socket.on('close', () => {
          sockets.delete(socket);
          closed.resolve();
        });
        socket.on('error', () => {
          /* 取消时允许连接重置。 */
        });
        accepted.resolve();
      });
      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', resolve),
      );
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('未取得端口');
      const connection = target();
      connection.endpoint.port = address.port;
      const controller = new AbortController();
      try {
        const probe = new OpenSshRunner().probe(connection, {
          signal: controller.signal,
          output: () => {},
        });
        const rejected = expect(probe).rejects.toMatchObject({
          code: 'cancelled',
        });
        await accepted.promise;
        controller.abort(new ExecutionFailure('cancelled', '已取消'));
        await rejected;
        await closed.promise;
        expect(sockets.size).toBe(0);
      } finally {
        controller.abort();
        for (const socket of sockets) socket.destroy();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    },
  );

  it.skipIf(!hasSsh)('真实 SSH 连接拒绝返回可识别的错误码和诊断', async () => {
    const server = createServer();
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('未取得端口');
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const connection = target();
    connection.endpoint.port = address.port;
    const chunks: string[] = [];
    await expect(
      new OpenSshRunner().probe(connection, {
        signal: AbortSignal.timeout(3000),
        output: (_stream, chunk) => {
          chunks.push(chunk);
        },
      }),
    ).rejects.toMatchObject({ code: 'connection_refused' });
    expect(chunks.join('')).toContain('Connection refused');
  });
});
