import { randomUUID } from 'node:crypto';
import {
  CreateTaskInput,
  type CreateTaskBody,
} from '@deploy-crab/contracts/task';
import {
  mongoConnectivity,
  mongoInitialize,
  mongoPreflight,
  mongoPrepare,
  mongoPrimary,
  mongoRepository,
  mongoUsers,
  mongoVerify,
} from './mongodb-scripts';

export function createMongoTasks(): { id: string; body: CreateTaskInput }[] {
  const ids = Object.fromEntries(
    ['source', 'prepare', 'initialize', 'users', 'verify', 'deploy'].map(
      (name) => [name, randomUUID()],
    ),
  );
  const parameters = {
    mongoVersion: {
      name: 'mongoVersion',
      title: 'MongoDB 版本系列',
      type: 'string' as const,
      required: true,
      description:
        '先检查所有节点的真实系统版本，通过后才安装。安装对应系列当前可用版本并锁定软件包；本任务不做升级。',
      options: [
        {
          value: '9.0',
          label: 'MongoDB 9.0',
          description: 'Ubuntu 26.04（9.0.4+）、24.04、22.04',
        },
        {
          value: '8.0',
          label: 'MongoDB 8.0',
          description: 'Ubuntu 24.04、22.04、20.04；不支持 26.04',
        },
      ],
    },
    replicaSetName: {
      name: 'replicaSetName',
      title: '复制集名称',
      type: 'string' as const,
      defaultValue: 'rs0',
    },
    members: {
      name: 'members',
      title: '复制集成员',
      type: 'json' as const,
      required: true,
      description:
        '每台主机一个实例。填写所有成员和客户端都能解析、访问的 DNS 主机名；不会自动使用 SSH 公网地址。推荐 1 个测试节点或 3 个数据节点。',
      targetFields: [
        {
          name: 'hostname',
          title: 'MongoDB DNS 主机名',
          type: 'string' as const,
        },
        {
          name: 'port',
          title: 'MongoDB 端口',
          type: 'number' as const,
          defaultValue: 27017,
        },
      ],
    },
    clusterKey: {
      name: 'clusterKey',
      title: '成员认证密钥',
      type: 'string' as const,
      required: true,
      secret: true,
      description:
        '所有节点共用同一凭据。请选择自动生成的随机凭据；重新执行时继续使用原凭据。',
    },
    adminUser: {
      name: 'adminUser',
      title: '管理用户名',
      type: 'string' as const,
      defaultValue: 'crab-admin',
    },
    adminPassword: {
      name: 'adminPassword',
      title: '管理用户密码',
      type: 'string' as const,
      required: true,
      secret: true,
      description: '选择或新建凭据。不会自动修改已有用户密码。',
    },
  };
  type Key = keyof typeof parameters;
  const base: Key[] = ['replicaSetName', 'members'];
  const auth: Key[] = [...base, 'adminUser', 'adminPassword'];
  const script = (
    text: string,
    usesInputs: Key[],
    output: 'text' | 'json' = 'text',
  ) => ({
    kind: 'action' as const,
    action: 'ssh.exec' as const,
    input: { script: text, output },
    usesInputs,
  });
  const reference = (name: string, names: Key[]) => ({
    kind: 'task' as const,
    taskId: ids[name]!,
    inputBindings: Object.fromEntries(
      names.map((key) => [key, { from: 'taskInput' as const, key }]),
    ),
  });
  const definition = (
    names: Key[],
    steps: CreateTaskBody['definition']['steps'],
    orchestrated = false,
  ): CreateTaskBody['definition'] => ({
    parameters: names.map((name) => parameters[name]),
    steps,
    execution: orchestrated ? 'orchestrated' : 'perHost',
  });
  const tasks: {
    key: string;
    name: string;
    description: string;
    definition: CreateTaskBody['definition'];
  }[] = [
    {
      key: 'source',
      name: 'MongoDB 软件源配置',
      description:
        '配置匹配 Ubuntu 发行版与 MongoDB 系列的官方 apt 源及签名密钥。需要 root。',
      definition: definition(
        ['mongoVersion'],
        [
          {
            id: 'source',
            title: '配置官方软件源',
            call: script(mongoRepository, ['mongoVersion']),
            timeoutMs: 300000,
          },
        ],
      ),
    },
    {
      key: 'prepare',
      name: 'MongoDB 节点准备',
      description:
        '检查节点、引用软件源配置、安装并配置带 keyfile 认证的 mongod。保留已有数据，遇到未知部署或配置差异时停止。',
      definition: definition(
        ['mongoVersion', ...base, 'clusterKey'],
        [
          {
            id: 'preflight',
            title: '检查节点环境与已有部署',
            call: script(mongoPreflight, ['mongoVersion', ...base]),
          },
          {
            id: 'source',
            title: '配置 MongoDB 软件源',
            call: reference('source', ['mongoVersion']),
            dependsOn: ['preflight'],
            timeoutMs: 300000,
          },
          {
            id: 'prepare',
            title: '安装、配置并启动节点',
            call: script(mongoPrepare, ['mongoVersion', ...base, 'clusterKey']),
            dependsOn: ['source'],
            timeoutMs: 600000,
          },
        ],
      ),
    },
    {
      key: 'initialize',
      name: 'MongoDB 复制集初始化',
      description:
        '仅在一个节点发起初始化，已有相同复制集则继续。等待选举并返回 primaryHostId，不执行隐式 reconfig。',
      definition: definition(
        auth,
        [
          {
            id: 'initialize',
            title: '初始化并识别 Primary',
            call: script(mongoInitialize, auth, 'json'),
            placement: { kind: 'first' },
            timeoutMs: 180000,
          },
        ],
        true,
      ),
    },
    {
      key: 'users',
      name: 'MongoDB 管理用户配置',
      description:
        '在实际 Primary 上创建管理账户或验证已有账户。提供用户管理与复制集管理权限；不自动覆盖密码。',
      definition: definition(
        auth,
        [
          {
            id: 'primary',
            title: '识别当前 Primary',
            call: script(mongoPrimary, auth, 'json'),
            placement: { kind: 'first' },
            timeoutMs: 120000,
          },
          {
            id: 'users',
            title: '配置并验证管理用户',
            call: script(mongoUsers, auth, 'json'),
            placement: {
              kind: 'result',
              stepId: 'primary',
              path: ['primaryHostId'],
            },
            dependsOn: ['primary'],
            timeoutMs: 90000,
          },
        ],
        true,
      ),
    },
    {
      key: 'verify',
      name: 'MongoDB 复制集检查',
      description:
        '验证认证和全部成员健康状态，返回成员角色和不含密码的连接地址。',
      definition: definition(
        auth,
        [
          {
            id: 'verify',
            title: '检查复制集状态',
            call: script(mongoVerify, auth, 'json'),
            placement: { kind: 'first' },
            timeoutMs: 180000,
          },
        ],
        true,
      ),
    },
    {
      key: 'deploy',
      name: 'MongoDB 复制集部署',
      description:
        '通过 root SSH 在 Ubuntu 部署新的单节点或多节点复制集。所有节点检查通过后并行准备，再单点初始化、在 Primary 创建账户并验证。keyfile 方案面向测试与开发环境；升级、扩容和凭据轮换使用独立流程。',
      definition: definition(
        Object.keys(parameters) as Key[],
        [
          {
            id: 'preflight',
            title: '检查所有节点',
            call: script(mongoPreflight, ['mongoVersion', ...base]),
            placement: { kind: 'each' },
            timeoutMs: 120000,
          },
          {
            id: 'prepare',
            title: '准备 MongoDB 节点',
            call: reference('prepare', ['mongoVersion', ...base, 'clusterKey']),
            placement: { kind: 'each' },
            dependsOn: ['preflight'],
            timeoutMs: 1200000,
          },
          {
            id: 'connectivity',
            title: '检查节点间连通性',
            call: script(mongoConnectivity, base),
            placement: { kind: 'each' },
            dependsOn: ['prepare'],
            timeoutMs: 120000,
          },
          {
            id: 'initialize',
            title: '初始化复制集',
            call: reference('initialize', auth),
            placement: { kind: 'first' },
            dependsOn: ['connectivity'],
            timeoutMs: 240000,
          },
          {
            id: 'users',
            title: '配置管理用户',
            call: reference('users', auth),
            placement: {
              kind: 'result',
              stepId: 'initialize',
              path: ['result', 'initialize', 'primaryHostId'],
            },
            dependsOn: ['initialize'],
            timeoutMs: 120000,
          },
          {
            id: 'verify',
            title: '验证复制集',
            call: reference('verify', auth),
            placement: { kind: 'first' },
            dependsOn: ['users'],
            timeoutMs: 240000,
          },
        ],
        true,
      ),
    },
  ];
  return tasks.map((task) => ({
    id: ids[task.key]!,
    body: CreateTaskInput.parse({
      name: task.name,
      description: task.description,
      labels: ['MongoDB', '数据库', task.key === 'deploy' ? '部署' : '子任务'],
      sourceUrl:
        'https://www.mongodb.com/docs/manual/administration/install-community-linux/?linux-distro=ubuntu&linux-method=pkg',
      definition: task.definition,
    }),
  }));
}
