# `@deploy-crab/core`

Node 侧共享的业务逻辑。本包直接导出 TypeScript 源码，由 server 的 Rspack 构建一起打包，测试由 Vitest 加载。业务代码不依赖 Nest，不能导入浏览器应用；浏览器可用的契约继续放在 `@deploy-crab/contracts`。

## 数据存储

主机、集群和任务定义通过 Drizzle ORM 和 better-sqlite3 保存到实例数据目录中的 `deploy-crab.sqlite`。资产使用 `hosts`、`clusters`、`cluster_members`、`cluster_member_groups`，任务定义使用 `tasks`、`task_references`，会话及其执行记录使用 `sessions`、`runs`，另外有 Drizzle 的迁移记录表。旧 YAML 文档存储已移除，不做自动导入。

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

任务库支持创建、编辑、复制和删除可复用的流程定义，数据契约位于 `contracts/task.ts`。每个步骤包含名称、调用、依赖、超时和钩子；调用分成 `{ kind: 'action', action, input }` 与 `{ kind: 'task', taskId, input?, inputBindings? }`。界面中的脚本步骤使用 `ssh.exec` Action 配置，包含 Shell、脚本原文和可选工作目录。目前可以选择的普通内建能力是 `ssh.probe`。

任务可自定义多个标签，使用与主机一致的 `labels: string[]` 字段，最多 20 个，每个最多 32 个字符，不含空格且不能重复。标签保存在 `tasks.labels` JSON 列中，字段合并在任务表创建迁移中，默认值为 `[]`。任务库支持关键词搜索及多标签交集筛选。任务引用选择器是一个入口：直接搜索名称、说明或标签，或通过“按标签浏览 → 标签 → 任务”的分层目录选择；复制任务会保留标签。当前通过已有任务列表在前端筛选，不增加分类表或额外搜索接口。

定义不绑定主机或 Session，不保存执行状态。任务钩子、步骤钩子支持 `before`、`afterSuccess`、`finally`，同一阶段按数组顺序保存。步骤的数组顺序用于展示，调度关系由 `dependsOn` 表达：新增步骤默认依赖上一步，用户可以清除或选择多个依赖。

步骤可声明 `skippable: true`，表示允许用户在后续 Session 的执行配置中选择跳过。默认值为 `false`，旧定义缺少该字段时也按 `false` 读取；即使允许跳过，默认仍然执行。该字段属于步骤（包括引用任务的步骤），不属于被引用任务本身，也不是执行状态。Session 可以按调用位置选择跳过，包括引用任务内部的步骤。被跳过步骤不执行主体与钩子，不解析其子任务参数；它仍等待前置依赖完成，之后按 `skipped` 放行后续步骤。前置失败仍然阻塞，不会通过跳过绕开失败。字段存于现有 `tasks.definition` JSON，不需要 migration。

`TaskService` 在单个写事务中检查名称、任务引用、循环和修改版本。`tasks.definition` 保存完整的 JSON 定义，`task_references` 索引步骤与全部钩子中的任务引用，外键和业务检查共同保护删除。步骤依赖循环由共享 Schema 检查，任务引用循环由 Service 检查。修改采用完整替换并提交当前 `revision`；过期版本返回 409，避免不同窗口互相覆盖。`revision` 是修改计数。Session 提交会校验本次看到的全部任务版本，并冻结编译后的计划、参数与连接快照；不提供任务库历史版本恢复。

| 接口 | 用途 |
| --- | --- |
| `GET /api/tasks/catalog` | 获取可配置能力；模板列表当前为空，不写入数据库 |
| `GET /api/tasks`、`GET /api/tasks/:id` | 查询任务定义 |
| `POST /api/tasks` | 创建定义，返回 201 |
| `PUT /api/tasks/:id` | 携带 `revision` 完整替换定义，返回 200 |
| `DELETE /api/tasks/:id` | 删除没有被引用的任务，返回 204 |

限制：每个任务 1–64 个步骤、每个阶段最多 8 个钩子、脚本最多 16000 字符、定义序列化后最多 24000 字符、单次调用超时配置 1 秒至 1 小时。步骤输出绑定和动态表达式尚未加入。

任务库保存纯定义；从 Session 选择任务与主机后，由 `compileStoredTask` 编译再交给执行内核。保存定义不会执行 SSH。子任务拥有独立 Run，父步骤或钩子等待子 Run 及其收尾结束，再汇总成功或失败；取消和超时向下传播并等待资源释放。内核与任务编辑器的超时上限统一为 1 小时。

### 参数定义与调用值

创建任务时通过参数卡声明 `definition.parameters`，每个字段包含 `name`、`title`、`description`、`type`（string/number/boolean/json）、`required` 和可选 `defaultValue`。最多 32 个字段，名称唯一。必填字段不能同时设置默认值；可选字段可以有默认值。独立任务只声明必填字段就能保存，无需在定义时提供调用值。

引用任务（含步骤与两层钩子）时，每个字段可选择“不传值”“固定值”“绑定当前任务参数”。固定值保存在 `call.input`；绑定规则保存在 `call.inputBindings`，默认值不固化到引用处。同一目标字段不能同时设置固定值和绑定；固定 JSON 中即使包含 `from`、`key` 也仍是普通数据。固定空字符串会显式传入，恢复子任务默认值应选择“不传值”。

例如 Docker 安装任务声明可选 `dockerMirrorUrl`（不设置默认值），引用镜像源配置任务时绑定其 `mirrorUrl`：

```ts
{
  kind: 'task',
  taskId: mirrorTaskId,
  inputBindings: {
    mirrorUrl: { from: 'taskInput', key: 'dockerMirrorUrl' },
  },
}
```

前后端用 `validateTaskInputMapping(parentParameters, childParameters, call)` 校验来源、目标和类型。相同类型可以绑定，任意声明类型也可以传入 JSON 字段；JSON 来源不能直接绑定到 string/number/boolean。未绑定的必填字段必须提供有效固定值；绑定的必填字段允许先保存定义，实际值在调用时校验。修改父参数或被引用任务的声明如果会使已有映射失效，整个更新事务会拒绝并提示调用者名称。

共享函数 `resolveTaskInputMapping(parentParameters, childParameters, call, parentInput)` 用于子任务编排：先将传入值覆盖父默认值，再按显式绑定传给子任务，最后合并子默认值并校验必填和类型。父字段缺失才不传；false、0、空字符串、null 均保留，不会触发默认值回退。必填字符串不能是空白，必填 JSON 不能是 null。返回 `issues` 非空时禁止派发子任务。可选来源绑定到必填目标允许保存，但调用时缺值仍会失败。每层只读取直接父任务的参数，不隐式继承同名字段；绑定不修改任何任务的默认值。

输入、映射展开及合并默认值后的快照最多 16000 字符；声明、固定值和绑定一起计入完整定义的 24000 字符上限。Session 先确定本次保留的步骤，再解析会执行的调用。全部嵌套调用通过参数校验后才派发，避免父步骤已经修改服务器才发现子步骤缺参。

Session 参数交互由共享的 `configureTask` 计算：根据保留的步骤及钩子取参数使用方的并集。同一参数只要还有使用方就保留；所有使用方被跳过后收起为“本次未使用”，不校验也不传入，原始表单草稿仍保留。必填标记在参数仍被使用时生效；子任务的有效必填要求会沿绑定向上传递，父/子默认值可以满足相应的缺值回退。脚本的 `usesInputs` 未声明时保守使用全部参数，显式数组表示只使用选中字段，`[]` 表示不使用任务参数；执行时也只注入声明范围内的字段。无需扫描脚本文本猜测使用关系。

定义及引用值仍保存于 SQLite 现有 `tasks.definition` JSON 列，无需新表或 migration。旧任务没有 `parameters` 时读取为 `[]`；旧调用如果传入未声明字段，需要在被引用任务声明该字段或移除值后才能再次保存。

执行内核的 `ExecutionPlan.parameters` 使用相同字段声明，`submit(plan, { input })` 在入队前校验并合并默认值，然后在 `Run.input` 中保存独立快照。未声明参数的计划按空声明处理。每次 Action/Hook 收到独立的 `context.taskInput`，不会因一个步骤修改对象而污染其他步骤。Action 的 `input` 仍然是能力配置（例如脚本、Shell、目录）。引用的 `input` 属于被引用任务；不隐式继承父任务参数，不支持 `{{...}}` 插值；子任务使用各自解析后的独立输入快照。

`ssh.exec` 把校验并合并默认值后的 `context.taskInput` 序列化为远端环境变量 `DEPLOY_CRAB_INPUT`；没有参数或默认值时为 `{}`。参数经过 Shell 字面量引用后与脚本一起从 SSH stdin 发送，不出现在 SSH 命令行参数中，不做变量名展开、模板替换或 `eval`。脚本编辑器提供根据当前参数生成的可复制读取示例。例如目标机器有 Python 3 时：

```sh
python3 - <<'PY'
import json, os
inputs = json.loads(os.environ.get('DEPLOY_CRAB_INPUT', '{}'))
mirror = inputs.get('mirrorUrl')  # 默认值在参数卡配置
print(mirror)
PY
```

参数目前是普通配置数据，会出现在定义和 Run 快照中，不是密钥存储；不要把凭据写入任务定义。

## 执行内核与主机连接检查

首个入口是主机表单的“测试连接”：当前草稿 → `HostService.checkConnection()` → `host.check` Task → Run → `check-connection` Step → `ssh.probe` Action → `SshRunner`。检查无需保存主机，也无需创建 Session。

| 概念 | 当前职责 |
| --- | --- |
| Action | 注册在 `ActionRegistry` 的能力实现，接收参数、目标、取消信号和输出回调 |
| TaskPlanner | 内置业务入口使用的计划生成适配器，将输入转换为 `ExecutionPlan`；用户任务定义单独保存在任务库 |
| Run | 一次 Task 派发，冻结一个目标及其跳板链，拥有独立 id 和生命周期 |
| Step | Run 内的一次 Action 调用，有自己的参数、依赖、结果和钩子 |
| Hook | 附着在 Run 或 Step 上的 Action 调用，也记录状态和错误 |
| Session | 用户命名的操作上下文，保存配置和 Run 历史；依赖仍由 Run/Step 显式声明 |

执行代码位于 `src/execution/`，与 Nest、数据库和 SSH 实现解耦。`src/tasks/host-check.ts` 是 TaskPlanner 示例，`src/actions/ssh-probe.ts` 是 Action 示例；`src/ssh/` 处理连接快照和 OpenSSH 进程。

### 依赖、并发和生命周期

`ExecutionService.submit(plan, { sessionId, source, dependsOn, input })` 创建并立即返回排队中的 Run。`get(id)` 查询快照，`cancel(id)` 请求取消，`subscribe(listener)` 观察变化，`close()` 取消执行并等待资源释放。

Run 的 `dependsOn` 引用其他已存在的 Run；Step 的 `dependsOn` 只引用同一 Run 内的 Step id。依赖不可在提交后修改，步骤图必须无环且引用有效。所有依赖成功后才能启动；前置节点失败或取消时，依赖节点标记为 `blocked`，无依赖分支继续执行。两台机器分别创建两个 Run，不配置依赖即可并发。并发额度默认 4，由全部 Run 共用；额度按叶子 Action 调用取得；等待子任务的编排节点不占槽，防止并发为 1 时死锁。任务钩子和步骤钩子同样受共享并发限制。

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

独立连接检查使用 `MemoryRunStore`：最多保留 200 个 Run，完成后保留 10 分钟，在读写时清理；仍被未结束 Run 依赖的记录暂不清理。输出保留最多 128 块、32,768 个字符，超出时保留末尾并标记截断。上述规则只适用于独立连接检查。Session 使用下述 SQLite 持久记录。

`sessionId: null` 表示没有会话归属，`retention: 'memory'` 表示临时保留，两者是独立含义。服务重启后临时记录消失；关闭抽屉不会取消已提交的检查。Session 使用 `PersistentRunStore`；未结束的持久记录在服务启动时转为 `interrupted`，不自动重跑远端操作。

| HTTP 接口 | 用途 |
| --- | --- |
| `POST /api/hosts/check-connection` | 接收主机连接草稿，202 返回排队中的 Run |
| `GET /api/runs/:id` | 返回状态、步骤、钩子、结构化结果及有限输出；过期返回 404 |
| `POST /api/runs/:id/cancel` | 请求取消，202 返回当前状态；需继续查询直到终态 |

检查请求只需 `publicAddress` 或 `privateAddress`、`user`，其他字段与主机连接配置一致；编辑主机时可附带 `hostId`，仍使用请求中的当前连接字段。`ConnectionResolver` 在一个 SQLite 读取快照中解析跳板链，网络执行发生在事务之外。

### SSH 执行约定

运行节点需要 OpenSSH 客户端。使用运行节点的 ssh-agent 或指定私钥路径；加密私钥可由 agent 为所选身份签名。连接使用单次临时配置文件和非交互模式。探测执行固定命令 `true`；脚本通过 `bash -s` 或 `sh -s` 执行，支持独立工作目录、标准输出和标准错误。脚本非零退出报告 `script_failed`；退出码 255 与 SSH 运输错误无法完全区分，按 SSH 错误处理。配置文件执行后清理，不是运行历史。

取消/超时会终止并等待本地 SSH 进程组退出。远端脚本如果主动脱离会话或忽略断连信号，其进程可能继续运行；当前没有远端作业管理器，不能保证回收任意后台任务。

配置隔离于用户的 `~/.ssh/config`，跳板每一跳使用各自的地址、用户和认证。保留严格主机指纹验证，使用运行节点的默认 known_hosts；首次连接需先在运行节点核实并信任指纹。未提供自动信任、密码交互或指纹确认界面。常见错误区分为未信任指纹、指纹变化、认证失败、超时、拒绝连接和名称解析失败，并提供原始诊断输出。

新增能力时先实现并注册 Action，再由 Task 编排 Step。UI 支持独立连接检查和 Session 任务执行。自动重试、跨进程队列和恢复远端进程不在当前实现范围内。

## Session 与持久执行

侧栏按 Header / 导航 / 会话列表 / Footer 排列，会话列表占满剩余高度并独立滚动。用户填写会话标题，可以重命名。Session 保存执行配置草稿及历史，一次可提交 1–32 台主机；每台主机一个顶层 Run，同一会话可有多个并发 Run，也可选择当前会话已有顶层 Run 作为成功前置条件。

`POST /api/sessions/:id/runs` 接收 `requestId`、`taskId`、`taskRevisions`、`hostIds`、`input`、`skippedSteps` 和 `dependsOn`。先在一致读取快照中验证版本、目标、全部有效参数和嵌套定义，再原子保存整个批次，最后调度。重试相同 `requestId` 和请求内容返回原 Run，不重复执行；复用标识却修改内容返回 409。最多 8 层任务引用、展开最多 512 个调用。可跳过路径按调用位置隔离，例如 `steps.configure.task.steps.prepare`，同一任务被引用两次时可以分别配置。

`0002_sessions_and_runs` 增加 `sessions`、`runs` 表。`runs.plan` 保存编译后的冻结计划，`runs.snapshot` 保存步骤、钩子、输入、目标及有限输出。子 Run 通过 `parent_run_id` 关联。运行快照最多每 250ms 合并落盘，创建与终态同步写入；服务关闭等待取消收尾后 flush。Session 每个 Run 保留最近 512 块 / 262144 字符的输出，单块最多 16384 字符，截断会在界面提示；尚不提供完整日志归档。重启将未结束记录标为中断，不自动继续安装或重复执行。取消只保证本地 SSH 进程结束，远端已产生的修改不回滚。

会话标题与配置更新带 `revision` 防止覆盖其他窗口；草稿允许保留未完成的 JSON，提交执行时才检查有效参数。界面显式保存配置，执行前也会保存，离开未保存配置时提示。删除仍有活动 Run 的会话返回 409；删除已结束会话会级联清除其执行历史，不删除任务库定义或撤销服务器修改。

| 接口 | 用途 |
| --- | --- |
| `GET/POST /api/sessions` | 列出会话摘要 / 创建用户命名的会话 |
| `GET/PATCH/DELETE /api/sessions/:id` | 读取 / 更新标题与草稿 / 删除 |
| `GET /api/sessions/:id/runs?before=<runId>&limit=20` | 顶层执行记录游标分页，单页最多 50 |
| `POST /api/sessions/:id/runs` | 提交一个或多个目标，202 返回 Run |
| `GET /api/runs/:id/tree` | 步骤、钩子与子 Run 的执行树和输出 |
| `POST /api/runs/:id/cancel` | 请求取消，继续轮询直到收尾结束 |

## 验证

```sh
pnpm --filter @deploy-crab/core test
pnpm --filter @deploy-crab/core check-types
pnpm --filter @deploy-crab/core lint
```

主机和集群的 Service 测试各自创建临时 SQLite 数据库并执行迁移，覆盖增删改查、名称唯一性、跳板链和成员引用等业务规则；测试结束后关闭连接并清理临时目录。

执行测试覆盖步骤与 Run 的依赖、共享并发额度、钩子失败传播、超时取消、记录过期及输出上限。OpenSSH 测试在客户端可用时验证配置解析、连接拒绝，以及取消后真实子进程断开本地测试连接。Server 的 execution e2e 通过替换 `SshRunner` 验证 HTTP、草稿快照、多跳解析、错误和取消；这些替身测试不代表远端 SSH 认证已经实测。
