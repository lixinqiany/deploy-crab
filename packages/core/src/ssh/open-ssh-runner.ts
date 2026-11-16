import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import {
  ConnectionTarget,
  type ConnectionEndpoint,
  type ProbeResult,
} from '@deploy-crab/contracts/connection';
import { checkAborted, ExecutionFailure } from '../execution/execution-failure';
import { SshRunner, type SshContext } from './ssh-runner';

const quote = (value: string): string =>
  '"' +
  value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%') +
  '"';

/** 固定别名和独立配置，不复用展示用的 shell 字符串，也不加载用户 ProxyCommand。 */
export function openSshConfig(target: ConnectionTarget): string {
  const connection = ConnectionTarget.parse(target);
  const defaults = [
    'Host *',
    '  BatchMode yes',
    '  StrictHostKeyChecking yes',
    '  PreferredAuthentications publickey',
    '  PasswordAuthentication no',
    '  KbdInteractiveAuthentication no',
    '  ForwardAgent no',
    '  ClearAllForwardings yes',
    '  RequestTTY no',
    '  ControlMaster no',
    '  ControlPath none',
    '  ConnectTimeout 8',
    '  ConnectionAttempts 1',
    '  ServerAliveInterval 5',
    '  ServerAliveCountMax 1',
    '  LogLevel ERROR',
  ];
  const endpoints: ConnectionEndpoint[] = [
    ...connection.jumps,
    connection.endpoint,
  ];
  const blocks = endpoints.map((endpoint, index) => {
    const lines = [
      `Host crab-${index}`,
      `  HostName ${quote(endpoint.address)}`,
      `  User ${quote(endpoint.user)}`,
      `  Port ${endpoint.port}`,
    ];
    if (endpoint.auth.method === 'key') {
      const raw = endpoint.auth.keyPath;
      const keyPath = raw.startsWith('~/')
        ? join(homedir(), raw.slice(2))
        : isAbsolute(raw)
          ? raw
          : resolve(raw);
      lines.push(`  IdentityFile ${quote(keyPath)}`, '  IdentitiesOnly yes');
    } else {
      lines.push('  IdentityFile none', '  IdentitiesOnly no');
    }
    if (index > 0) lines.push(`  ProxyJump crab-${index - 1}`);
    return lines.join('\n');
  });
  return [...defaults, '', ...blocks].join('\n') + '\n';
}

function sshFailure(stderr: string): ExecutionFailure {
  if (/REMOTE HOST IDENTIFICATION HAS CHANGED/i.test(stderr))
    return new ExecutionFailure(
      'host_key_changed',
      '主机指纹已变化，请在运行 Deploy Crab 的机器上核实',
    );
  if (/Host key verification failed/i.test(stderr))
    return new ExecutionFailure(
      'host_key_untrusted',
      '主机指纹尚未信任，请先在运行 Deploy Crab 的机器上通过 SSH 确认指纹后重试',
    );
  if (
    /Permission denied|sign_and_send_pubkey|no such identity|Load key/i.test(
      stderr,
    )
  )
    return new ExecutionFailure(
      'authentication_failed',
      'SSH 认证失败，请检查运行节点的 ssh-agent、私钥路径及登录用户；加密私钥请先加载到 agent',
    );
  if (/timed out|Timeout/i.test(stderr))
    return new ExecutionFailure(
      'timeout',
      'SSH 连接超时，请检查地址、跳板和网络',
    );
  if (/Connection refused/i.test(stderr))
    return new ExecutionFailure(
      'connection_refused',
      'SSH 连接被拒绝，请检查端口和 SSH 服务',
    );
  if (/Could not resolve hostname|Name or service not known/i.test(stderr))
    return new ExecutionFailure(
      'name_resolution_failed',
      '无法解析主机地址，请检查目标和跳板地址',
    );
  return new ExecutionFailure('ssh_failed', 'SSH 检查失败，请查看诊断输出');
}

/** 探测使用全新、非交互连接；默认信任运行节点的 known_hosts，不自动接纳新指纹。 */
export class OpenSshRunner extends SshRunner {
  async probe(
    target: ConnectionTarget,
    context: SshContext,
  ): Promise<ProbeResult> {
    const config = openSshConfig(target);
    checkAborted(context.signal);
    const directory = await mkdtemp(join(tmpdir(), 'deploy-crab-ssh-'));
    const started = Date.now();
    try {
      const path = join(directory, 'config');
      await writeFile(path, config, { mode: 0o600 });
      checkAborted(context.signal);
      await this.check(path, target.jumps.length, context);
      return {
        connected: true,
        elapsedMs: Date.now() - started,
        address: target.endpoint.address,
        port: target.endpoint.port,
        user: target.endpoint.user,
        hopCount: target.jumps.length,
      };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  private check(
    configPath: string,
    targetIndex: number,
    context: SshContext,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        'ssh',
        ['-F', configPath, '-T', '-n', `crab-${targetIndex}`, 'true'],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: false,
          detached: process.platform !== 'win32',
          env: { ...process.env, LC_ALL: 'C', SSH_ASKPASS_REQUIRE: 'never' },
        },
      );
      let stderr = '';
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const kill = (signal: NodeJS.Signals) => {
        try {
          if (process.platform !== 'win32' && child.pid)
            process.kill(-child.pid, signal);
          else child.kill(signal);
        } catch {
          /* 子进程可能已经退出。 */
        }
      };
      const abort = () => {
        kill('SIGTERM');
        killTimer = setTimeout(() => kill('SIGKILL'), 500);
        killTimer.unref();
      };
      const cleanup = () => {
        context.signal.removeEventListener('abort', abort);
        if (killTimer) clearTimeout(killTimer);
      };
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) =>
        context.output('stdout', chunk),
      );
      child.stderr.on('data', (chunk: string) => {
        stderr = (stderr + chunk).slice(-32_768);
        context.output('stderr', chunk);
      });
      child.once('error', (error: NodeJS.ErrnoException) => {
        cleanup();
        reject(
          new ExecutionFailure(
            error.code === 'ENOENT' ? 'ssh_unavailable' : 'ssh_start_failed',
            error.code === 'ENOENT'
              ? '运行节点未安装 OpenSSH 客户端'
              : '无法启动 OpenSSH 客户端',
          ),
        );
      });
      child.once('close', (code) => {
        cleanup();
        try {
          checkAborted(context.signal);
        } catch (error) {
          reject(error instanceof Error ? error : new Error('执行已取消'));
          return;
        }
        if (code === 0) resolve();
        else reject(sshFailure(stderr));
      });
      context.signal.addEventListener('abort', abort, { once: true });
      if (context.signal.aborted) abort();
    });
  }
}
