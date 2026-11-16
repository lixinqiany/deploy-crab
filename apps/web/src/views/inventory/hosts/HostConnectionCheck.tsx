import {
  CheckHostInput,
  type CheckHostBody,
} from '@deploy-crab/contracts/connection';
import {
  isExecutionFinished,
  type Run,
} from '@deploy-crab/contracts/execution';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { hostsApi } from '@/api/hosts';
import { runsApi } from '@/api/runs';

interface Attempt {
  fingerprint: string;
  submitting: boolean;
  run?: Run;
  error?: string;
}

export const HostConnectionCheck = ({
  connection,
}: {
  connection: CheckHostBody;
}) => {
  const parsed = CheckHostInput.safeParse(connection);
  const fingerprint = JSON.stringify(parsed.success ? parsed.data : connection);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const generation = useRef(0);
  const queryClient = useQueryClient();
  // 关闭抽屉不取消服务端执行，只忽略尚未返回的提交响应。
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );

  const query = useQuery({
    queryKey: ['runs', attempt?.run?.id],
    queryFn: () => runsApi.get(attempt!.run!.id),
    enabled: !!attempt?.run,
    refetchInterval: (query) =>
      query.state.error ||
      (query.state.data && isExecutionFinished(query.state.data.status))
        ? false
        : 500,
    retry: false,
    gcTime: 60_000,
  });
  const run = query.data ?? attempt?.run;
  const current = attempt?.fingerprint === fingerprint;
  const checking =
    current &&
    !query.error &&
    (attempt?.submitting || (run && !isExecutionFinished(run.status)));
  const cancel = useMutation({
    mutationFn: runsApi.cancel,
    onSuccess: (run) => queryClient.setQueryData(['runs', run.id], run),
  });

  const start = async () => {
    cancel.reset();
    const version = ++generation.current;
    if (!parsed.success) {
      setAttempt({
        fingerprint,
        submitting: false,
        error: parsed.error.issues[0]?.message ?? '请检查连接配置',
      });
      return;
    }
    setAttempt({ fingerprint, submitting: true });
    try {
      const run = await hostsApi.checkConnection(parsed.data);
      if (version === generation.current)
        setAttempt({ fingerprint, submitting: false, run });
    } catch (error) {
      if (version === generation.current)
        setAttempt({
          fingerprint,
          submitting: false,
          error: error instanceof Error ? error.message : '无法发起连接检查',
        });
    }
  };

  const error = attempt?.error ?? query.error?.message ?? cancel.error?.message;
  const failure =
    run?.steps.find((step) => step.errors.length)?.errors[0]?.message ??
    run?.errors[0]?.message;
  const output = run?.output.map((item) => item.text).join('');

  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button loading={!!checking} onClick={() => void start()}>
          测试连接
        </Button>
        {checking && run && !error && (
          <Button
            loading={cancel.isPending}
            onClick={() => cancel.mutate(run.id)}
          >
            停止检查
          </Button>
        )}
        <span className="text-xs text-sand-9">
          使用当前配置，无需先保存主机
        </span>
      </div>
      {attempt && !current && (
        <Alert type="info" title="连接配置已修改，请重新测试" showIcon />
      )}
      {current && error && <Alert type="error" title={error} showIcon />}
      {current && !error && run && (
        <Alert
          showIcon
          type={
            run.status === 'succeeded'
              ? 'success'
              : !isExecutionFinished(run.status)
                ? 'info'
                : run.status === 'cancelled'
                  ? 'warning'
                  : 'error'
          }
          title={
            run.status === 'succeeded'
              ? 'SSH 连接成功，可执行远程命令'
              : !isExecutionFinished(run.status)
                ? '正在检查连接…'
                : run.status === 'cancelled'
                  ? '检查已停止'
                  : (failure ?? '连接检查未完成')
          }
          description={
            output ? (
              <details>
                <summary className="cursor-pointer">
                  诊断输出{run.outputTruncated ? '（已截断）' : ''}
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto text-xs whitespace-pre-wrap break-all">
                  {output}
                </pre>
              </details>
            ) : undefined
          }
        />
      )}
    </div>
  );
};
