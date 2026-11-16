import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConnectionTarget } from '@deploy-crab/contracts/connection';
import { isExecutionFinished } from '@deploy-crab/contracts/execution';
import type { TaskInput } from '@deploy-crab/contracts/task-input';
import { TaskParameters } from '@deploy-crab/contracts/task-input';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionRegistry } from '../execution/action-registry';
import { ExecutionService } from '../execution/execution-service';
import { MemoryRunStore } from '../execution/run-store';
import { OpenSshRunner } from '../ssh/open-ssh-runner';
import { sshExecAction } from './ssh-exec';

const target: ConnectionTarget = {
  hostId: null,
  endpoint: {
    address: 'example.invalid',
    port: 22,
    user: 'root',
    auth: { method: 'agent' },
  },
  jumps: [],
};

describe('ssh.exec 参数通道（本地 SSH 替身，真实 Shell）', () => {
  let directory: string;
  let service: ExecutionService;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'deploy-crab-script-test-'));
    // 替代网络运输，仍由 OpenSshRunner 启动进程、写入 stdin 并收集输出。
    await writeFile(
      join(directory, 'ssh'),
      `#!/bin/sh
test "$1" = '-F' && test -f "$2" && test "$3" = '-T' || exit 98
case "$5" in
  'bash -s') exec /bin/bash -s ;;
  'sh -s') exec /bin/sh -s ;;
  *) exit 99 ;;
esac
`,
      { mode: 0o700 },
    );
    vi.stubEnv('PATH', `${directory}:${process.env.PATH ?? ''}`);
    service = new ExecutionService(
      new ActionRegistry().register(sshExecAction(new OpenSshRunner())),
      new MemoryRunStore(),
    );
  });
  afterEach(async () => {
    await service.close();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });
  const run = async (
    script: string,
    input?: TaskInput,
    cwd: string | null = null,
    shell: 'bash' | 'sh' = 'bash',
  ) => {
    const submitted = service.submit(
      {
        task: 'script-test',
        parameters: TaskParameters.parse(
          Object.keys(input ?? {}).map((name) => ({ name, type: 'json' })),
        ),
        target,
        steps: [
          {
            id: 'script',
            title: '脚本',
            action: 'ssh.exec',
            input: { script, shell, cwd },
          },
        ],
      },
      input === undefined ? {} : { input },
    );
    await vi.waitFor(
      () =>
        expect(isExecutionFinished(service.get(submitted.id).status)).toBe(
          true,
        ),
      { timeout: 3000 },
    );
    return service.get(submitted.id);
  };

  it.each(['bash', 'sh'] as const)(
    '%s 保留复杂参数和工作目录，参数不会作为命令执行',
    async (shell) => {
      const cwd = join(directory, "working ' $(printf unsafe) space");
      await mkdir(cwd);
      const input = {
        mirrorUrl: 'https://docker.m.daocloud.io',
        text: '引号\'"，换行\n，$HOME，$(printf injected >&2)，`printf injected >&2`',
        nested: { enabled: false, count: 0, values: [null, ''] },
      };
      const done = await run(
        'printf "%s\\n" "$PWD"\nprintf "%s" "$DEPLOY_CRAB_INPUT"\nprintf diagnostic >&2',
        input,
        cwd,
        shell,
      );
      expect(done.status).toBe('succeeded');
      expect(
        done.output
          .filter((chunk) => chunk.stream === 'stdout')
          .map((chunk) => chunk.text)
          .join(''),
      ).toBe(`${cwd}\n${JSON.stringify(input)}`);
      expect(
        done.output
          .filter((chunk) => chunk.stream === 'stderr')
          .map((chunk) => chunk.text)
          .join(''),
      ).toBe('diagnostic');
      expect(done.steps[0]?.result).toMatchObject({ exitCode: 0 });
    },
  );

  it('未传参数时，即使运行节点有同名环境变量，脚本也得到空对象', async () => {
    vi.stubEnv('DEPLOY_CRAB_INPUT', '{"stale":true}');
    const done = await run('printf "%s" "$DEPLOY_CRAB_INPUT"');
    expect(done.status).toBe('succeeded');
    expect(done.output.map((chunk) => chunk.text).join('')).toBe('{}');
  });

  it('脚本失败保留退出码和输出，不误判为 SSH 认证错误', async () => {
    const done = await run(
      'printf "Permission denied: application" >&2\nexit 7',
    );
    expect(done.status).toBe('failed');
    expect(done.steps[0]?.errors[0]).toMatchObject({ code: 'script_failed' });
    expect(done.steps[0]?.errors[0]?.message).toContain('7');
    expect(done.output.map((chunk) => chunk.text).join('')).toContain(
      'Permission denied',
    );
  });

  it('取消脚本后等待本地进程关闭并保留取消状态', async () => {
    const submitted = service.submit({
      task: 'cancel-script',
      target,
      steps: [
        {
          id: 'script',
          title: '等待',
          action: 'ssh.exec',
          input: { script: 'printf ready\nsleep 30' },
        },
      ],
    });
    await vi.waitFor(() =>
      expect(
        service
          .get(submitted.id)
          .output.map((chunk) => chunk.text)
          .join(''),
      ).toContain('ready'),
    );
    service.cancel(submitted.id);
    await vi.waitFor(() =>
      expect(service.get(submitted.id).status).toBe('cancelled'),
    );
  });
});
