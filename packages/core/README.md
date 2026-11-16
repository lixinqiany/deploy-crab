# `@deploy-crab/core`

Node 侧共享的业务逻辑。本包直接导出 TypeScript 源码，由 server 的 Rspack 构建一起打包，测试由 Vitest 加载。业务代码不依赖 Nest，不能导入浏览器应用；浏览器可用的契约继续放在 `@deploy-crab/contracts`。

## 数据存储

主机、集群和任务定义通过 Drizzle ORM 和 better-sqlite3 保存到实例数据目录中的 `deploy-crab.sqlite`。资产使用 `hosts`、`clusters`、`cluster_members`、`cluster_member_groups`，任务定义使用 `tasks`、`task_references`，另外有 Drizzle 的迁移记录表。旧 YAML 文档存储已移除，不做自动导入。

数据目录沿用 `--data-dir`，默认为 `~/.deploy-crab/`，开发脚本使用仓库根目录的 `.deploy-crab/`。SQLite 在连接期间可能创建 `deploy-crab.sqlite-wal` 和 `deploy-crab.sqlite-shm`；这些由数据库管理，不是额外的业务文件。备份时停止服务后复制实例数据目录，不要在运行中手工删除 WAL 或 SHM。

| 子路径                                           | 职责                                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| `@deploy-crab/core/database/database`            | `Database`：打开连接、配置 WAL/外键/同步持久化、执行迁移、读写事务和关闭连接 |
| `@deploy-crab/core/database/schema`              | Drizzle 运行时的表集合，统一导出各表                                         |
| `@deploy-crab/core/inventory/host-repository`    | 主机查询、写入和数据库错误转换                                               |
| `@deploy-crab/core/inventory/cluster-repository` | 集群、成员和有序分组的查询与写入                                             |
| `@deploy-crab/core/inventory/host-service`       | 名称、地址、跳板链和删除引用检查                                             |
| `@deploy-crab/core/inventory/cluster-service`    | 集群名称、成员引用和整体成员替换                                             |
| `@deploy-crab/core/errors/domain-error`          | 与 HTTP 无关的领域错误                                                       |
| `@deploy-crab/core/utils/data-directory`         | 数据目录解析与创建                                                           |
| `@deploy-crab/core/utils/defined-fields`         | 部分更新时忽略 undefined 字段                                                |

## 事务与连接

调用方创建实例数据目录，并向 `new Database(filename, migrationsDirectory)` 显式提供数据库路径和迁移资源目录。一个 server 共用一个连接，`DatabaseModule` 在监听前初始化数据库，在应用关闭时关闭连接。

资产 Service 保留 Promise 接口，任务定义 Service 和 Repository 使用同步查询。`Database.write()` 从业务检查到修改完成使用同一个 IMMEDIATE 事务；`Database.read()` 为相关读取提供一致快照。事务回调必须同步完成，禁止在事务内等待网络或返回 Promise。仓储只接收当前事务的查询能力，不自行提交事务。

数据库保存规范化的 `name_key`，按 JavaScript `toLowerCase()` 判断名称唯一；业务列表保留 `localeCompare()` 排序。成员和分组有独立顺序字段。认证配置仅包含 agent 或私钥路径，和标签一样使用小型 JSON 列；读回时按 contracts 校验，损坏数据会报错。

## 表结构迁移

表定义放在 `src/database/tables/`，每张表一个文件，包括资产表以及 `tasks.ts`、`task-references.ts`。`src/database/schema.ts` 只统一导出，供运行时注册；`tables/shares/audit-columns.ts` 提供共享时间字段。Drizzle Kit 直接扫描 `tables/*.ts`。

修改对应表文件后，在仓库根目录执行：

```sh
pnpm --filter @deploy-crab/core db:generate --name=describe_change
```

审查并提交 `migrations/` 中生成的 SQL、journal 和 schema snapshot。已发布的迁移不修改，通过新迁移升级。应用启动时使用 Drizzle migrator 执行尚未应用的迁移；失败会关闭连接并停止启动，不自动重建或清空数据库。

Server 的 Rspack 配置将该目录复制到 `.dev/migrations/` 和 `dist/migrations/`，运行时从入口文件旁读取，不依赖源码目录或启动工作目录。`drizzle-kit` 只用于开发，生产环境只需运行依赖和已生成的迁移文件。

## 用户任务定义

任务库支持创建、编辑、复制和删除可复用的流程定义，数据契约位于 `contracts/task.ts`。每个步骤包含名称、调用、依赖、超时和钩子；调用分成 `{ kind: 'action', action, input }` 与 `{ kind: 'task', taskId }`。界面中的脚本步骤使用 `ssh.exec` Action 配置，包含 Shell、脚本原文和可选工作目录。目前可以选择的普通内建能力是 `ssh.probe`。

任务可自定义多个标签，使用与主机一致的 `labels: string[]` 字段，最多 20 个，每个最多 32 个字符，不含空格且不能重复。标签保存在 `tasks.labels` JSON 列中，字段合并在任务表创建迁移中，默认值为 `[]`。任务库和任务引用选择器均支持名称、说明、标签的关键词搜索，以及同时包含所选标签的筛选；复制任务会保留标签。当前通过已有任务列表在前端筛选，不增加分类表或额外搜索接口。

定义不绑定主机或 Session，不保存执行状态。任务钩子、步骤钩子支持 `before`、`afterSuccess`、`finally`，同一阶段按数组顺序保存。步骤的数组顺序用于展示，调度关系由 `dependsOn` 表达：新增步骤默认依赖上一步，用户可以清除或选择多个依赖。

`TaskService` 在单个写事务中检查名称、任务引用、循环和修改版本。`tasks.definition` 保存完整的 JSON 定义，`task_references` 索引步骤与全部钩子中的任务引用，外键和业务检查共同保护删除。步骤依赖循环由共享 Schema 检查，任务引用循环由 Service 检查。修改采用完整替换并提交当前 `revision`；过期版本返回 409，避免不同窗口互相覆盖。`revision` 是修改计数，当前没有历史版本恢复或运行版本锁定。

| 接口 | 用途 |
| --- | --- |
| `GET /api/tasks/catalog` | 获取可配置能力；模板列表当前为空，不写入数据库 |
| `GET /api/tasks`、`GET /api/tasks/:id` | 查询任务定义 |
| `POST /api/tasks` | 创建定义，返回 201 |
| `PUT /api/tasks/:id` | 携带 `revision` 完整替换定义，返回 200 |
| `DELETE /api/tasks/:id` | 删除没有被引用的任务，返回 204 |

限制：每个任务 1–64 个步骤、每个阶段最多 8 个钩子、脚本最多 16000 字符、定义序列化后最多 24000 字符、单次调用超时配置 1 秒至 1 小时。运行时任务参数、步骤输出绑定和动态表达式尚未加入。

本阶段只实现任务创建与保存，没有任务运行接口、子 Run 或 Session 功能。`ssh.exec` 当前是可保存的能力契约，尚未注册执行实现。保存任务不会调用 `ExecutionService` 或 SSH。以后需增加定义到计划的绑定、子任务执行与取消传播、脚本执行器及相应超时规则，才能运行这些定义。

## 执行骨架（现有主机连接检查）

首个入口是主机表单的“测试连接”：当前草稿 → `HostService.checkConnection()` → `host.check` Task → Run → `check-connection` Step → `ssh.probe` Action → `SshRunner`。检查无需保存主机，也无需创建 Session。

| 概念 | 当前职责 |
| --- | --- |
| Action | 注册在 `ActionRegistry` 的能力实现，接收参数、目标、取消信号和输出回调 |
| TaskPlanner | 内置业务入口使用的计划生成适配器，将输入转换为 `ExecutionPlan`；用户任务定义单独保存在任务库 |
| Run | 一次 Task 派发，冻结一个目标及其跳板链，拥有独立 id 和生命周期 |
| Step | Run 内的一次 Action 调用，有自己的参数、依赖、结果和钩子 |
| Hook | 附着在 Run 或 Step 上的 Action 调用，也记录状态和错误 |
| Session | 目前只预留可空的 `sessionId`，不参与调度 |

执行代码位于 `src/execution/`，与 Nest、数据库和 SSH 实现解耦。`src/tasks/host-check.ts` 是 TaskPlanner 示例，`src/actions/ssh-probe.ts` 是 Action 示例；`src/ssh/` 处理连接快照和 OpenSSH 进程。

### 依赖、并发和生命周期

`ExecutionService.submit(plan, { sessionId, source, dependsOn })` 创建并立即返回排队中的 Run。`get(id)` 查询快照，`cancel(id)` 请求取消，`subscribe(listener)` 观察变化，`close()` 取消执行并等待资源释放。

Run 的 `dependsOn` 引用其他已存在的 Run；Step 的 `dependsOn` 只引用同一 Run 内的 Step id。依赖不可在提交后修改，步骤图必须无环且引用有效。所有依赖成功后才能启动；前置节点失败或取消时，依赖节点标记为 `blocked`，无依赖分支继续执行。两台机器分别创建两个 Run，不配置依赖即可并发。并发额度默认 4，由全部 Run 共用；一个额度覆盖整个 Step 的主体和钩子，Run 自身的钩子独立取得额度。

Run 和 Step 使用相同的生命周期：

```text
queued → running
           before → body → afterSuccess
              任一失败或取消 ↘
                            finally → 汇总终态
```

- `before`：按顺序执行；失败则跳过主体和 `afterSuccess`。
- `body`：Step 调用 Action；Run 调度自己的步骤图。
- `afterSuccess`：主体成功后按顺序执行；失败则停止后续同阶段钩子。
- `finally`：已经进入生命周期的节点始终尝试所有收尾钩子；排队中被取消或被依赖阻塞的节点不执行钩子。
- 钩子失败计入所属 Run/Step 的失败，主体错误和收尾错误都保留。所有钩子结束后才发布终态、放行依赖。`finally` 使用新的取消信号，每个钩子默认超时 5 秒；普通 Action 默认 30 秒，主机探测为 20 秒。
- `context.lifecycle` 提供所属节点当前阶段、主体结果和累计错误的快照；`context.results` 提供成功步骤的结果。
- 通知订阅只负责观察，其同步异常不会影响执行；业务逻辑写在钩子中。

主体与钩子均使用同样的 Action 引用，例如在 Task 的计划里配置：

```ts
{
  task: 'example',
  target,
  steps: [
    { id: 'check', title: '检查连接', action: 'ssh.probe' },
    // 新增能力后，可以在这里追加 dependsOn: ['check'] 的步骤。
  ],
  hooks: {
    finally: [{ key: 'verify-connection', action: 'ssh.probe', timeoutMs: 5000 }],
  },
}
```

Action 必须响应 `context.signal`，结束自身操作、释放资源后才 settle Promise。内核不会用 Promise.race 伪装成已经取消；忽略 signal 的第三方能力会阻塞收尾。取消 SSH 会结束本地进程；未来远程安装等有副作用的能力仍需自行实现幂等、检查或回滚，断开 SSH 不能保证远端操作回滚。

### 临时记录与 HTTP

执行记录只启用 `MemoryRunStore`：最多保留 200 个 Run，完成后保留 10 分钟，在读写时清理；仍被未结束 Run 依赖的记录暂不清理。输出保留最多 128 块、32,768 个字符，超出时保留末尾并标记截断。运行记录没有 SQLite 表、每次执行的 JSON 文件、持久日志或 activity 目录；上文的任务定义表保存可复用的流程配置。

`sessionId: null` 表示没有会话归属，`retention: 'memory'` 表示临时保留，两者是独立含义。服务重启后临时记录消失；关闭抽屉不会取消已提交的检查。后续持久执行需要补充保留策略、SQLite RunStore 和重启中断处理；当前不提供恢复执行，`interrupted` 仅预留状态。

| HTTP 接口 | 用途 |
| --- | --- |
| `POST /api/hosts/check-connection` | 接收主机连接草稿，202 返回排队中的 Run |
| `GET /api/runs/:id` | 返回状态、步骤、钩子、结构化结果及有限输出；过期返回 404 |
| `POST /api/runs/:id/cancel` | 请求取消，202 返回当前状态；需继续查询直到终态 |

检查请求只需 `publicAddress` 或 `privateAddress`、`user`，其他字段与主机连接配置一致；编辑主机时可附带 `hostId`，仍使用请求中的当前连接字段。`ConnectionResolver` 在一个 SQLite 读取快照中解析跳板链，网络执行发生在事务之外。

### SSH 执行约定

运行节点需要 OpenSSH 客户端。使用运行节点的 ssh-agent 或指定私钥路径；加密私钥可由 agent 为所选身份签名。连接使用单次临时配置文件、非交互模式和固定命令 `true`，因此成功表示 SSH 认证和远程命令执行都通过。配置文件执行后清理，不是运行历史。

配置隔离于用户的 `~/.ssh/config`，跳板每一跳使用各自的地址、用户和认证。保留严格主机指纹验证，使用运行节点的默认 known_hosts；首次连接需先在运行节点核实并信任指纹。未提供自动信任、密码交互或指纹确认界面。常见错误区分为未信任指纹、指纹变化、认证失败、超时、拒绝连接和名称解析失败，并提供原始诊断输出。

新增能力时先实现并注册 Action，再由 Task 编排 Step。当前运行链路只接入 `host.check` / `ssh.probe`；其他能力执行、重试、跨进程队列和持久恢复留待实际业务需要时扩展。

## 验证

```sh
pnpm --filter @deploy-crab/core test
pnpm --filter @deploy-crab/core check-types
pnpm --filter @deploy-crab/core lint
```

主机和集群的 Service 测试各自创建临时 SQLite 数据库并执行迁移，覆盖增删改查、名称唯一性、跳板链和成员引用等业务规则；测试结束后关闭连接并清理临时目录。

执行测试覆盖步骤与 Run 的依赖、共享并发额度、钩子失败传播、超时取消、记录过期及输出上限。OpenSSH 测试在客户端可用时验证配置解析、连接拒绝，以及取消后真实子进程断开本地测试连接。Server 的 execution e2e 通过替换 `SshRunner` 验证 HTTP、草稿快照、多跳解析、错误和取消；这些替身测试不代表远端 SSH 认证已经实测。
