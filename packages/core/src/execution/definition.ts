import type {
  ExecutionError,
  ExecutionPhase,
  HookPhase,
} from '@deploy-crab/contracts/execution';
import type {
  TaskInput,
  TaskParameter,
} from '@deploy-crab/contracts/task-input';
import type {
  TaskExecutionContext,
  TaskPlacement,
} from '@deploy-crab/contracts/task-placement';
import type { ConfiguredTask } from '@deploy-crab/contracts/task-configuration';
import type { TaskInputMapping } from '@deploy-crab/contracts/task-input-bindings';
import type { ConnectionTarget } from '@deploy-crab/contracts/connection';

export interface ActionContext {
  runId: string;
  stepId: string | null;
  target: unknown;
  executionContext?: TaskExecutionContext;
  secretInputs?: string[];
  /** 本次任务调用的数据快照；不同于 Action 自身的配置 input。 */
  taskInput: TaskInput;
  signal: AbortSignal;
  /** 所属 Run/Step 在调用时的快照，供后置和收尾钩子读取结果与错误。 */
  lifecycle: {
    phase: ExecutionPhase;
    result: unknown;
    errors: readonly ExecutionError[];
  };
  /** 已完成步骤的结构化结果，按步骤 id 隔离。 */
  results: Readonly<Record<string, unknown>>;
  output(stream: 'stdout' | 'stderr', text: string): void;
}

/** Action 必须响应 signal；超时/取消后结束自身操作并释放资源。 */
export interface Action {
  key: string;
  execute(input: unknown, context: ActionContext): Promise<unknown>;
}

export interface ActionCall {
  action: string;
  input?: unknown;
  timeoutMs?: number | undefined;
  task?: { plan: ExecutionPlan; input: TaskInput };
  dispatch?: {
    placement: TaskPlacement;
    branches: { hostId: string; plan: ExecutionPlan; input: TaskInput }[];
  };
  deferredTask?: {
    config: ConfiguredTask;
    mapping: TaskInputMapping;
    parameters: TaskParameter[];
    target: ConnectionTarget;
    targetName: string;
    context: TaskExecutionContext;
  };
  usesInputs?: string[];
}

export interface HookDefinition extends ActionCall {
  key: string;
  title?: string;
}
export type Hooks = Partial<Record<HookPhase, HookDefinition[]>>;

/** 定义数据用于生成 Run 下具体的 Step，定义本身不保存执行状态。 */
export interface StepDefinition extends ActionCall {
  id: string;
  title: string;
  dependsOn?: string[];
  hooks?: Hooks;
  skip?: boolean;
}

export interface ExecutionPlan {
  context?: TaskExecutionContext;
  parameters?: TaskParameter[];
  task: string;
  target: unknown;
  steps: StepDefinition[];
  hooks?: Hooks;
  taskId?: string;
  taskRevision?: number;
  targetName?: string;
  skippedSteps?: string[];
}

/** 代码生成执行计划的适配器；用户保存的流程定义见 contracts/task。 */
export interface TaskPlanner<T> {
  key: string;
  plan(input: T): ExecutionPlan;
}
