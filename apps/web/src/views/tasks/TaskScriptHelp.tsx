import type { TaskParameter } from '@deploy-crab/contracts/task-input';
import { Typography } from 'antd';
import { taskInputExample } from './parameter-editor-model';

export const TaskScriptHelp = ({
  parameters,
}: {
  parameters: TaskParameter[];
}) => (
  <details className="mb-4 rounded-lg border border-sand-4 bg-sand-2 p-3 text-xs text-sand-11">
    <summary className="cursor-pointer font-medium">
      脚本如何读取任务参数
    </summary>
    <p>
      参数通过环境变量 <code>DEPLOY_CRAB_INPUT</code> 传入，内容是
      JSON。必填项会先校验，可选项会合并默认值；没有传值且没有默认值的字段不会出现。
    </p>
    {parameters.length ? (
      <>
        <p>
          下面按当前参数生成示例，可粘贴到 Bash 或 Sh 脚本中。目标主机需要
          Python 3，把 print 换成你的业务逻辑。
        </p>
        <Typography.Paragraph
          copyable={{ text: taskInputExample(parameters) }}
          className="mb-0"
        >
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all">
            {taskInputExample(parameters)}
          </pre>
        </Typography.Paragraph>
      </>
    ) : (
      <p>先在上方“任务参数”卡片添加字段，这里会生成对应的读取示例。</p>
    )}
    <p className="mb-0">每个步骤使用独立 Shell；不要使用 eval 执行参数内容。</p>
  </details>
);
