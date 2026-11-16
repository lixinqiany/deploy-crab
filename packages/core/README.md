# `@deploy-crab/core`

Node 侧共享的业务逻辑。本包直接导出 TypeScript 源码，由 server 的 Rspack 构建一起打包，测试由 Vitest 加载。业务代码不依赖 Nest，不能导入浏览器应用；浏览器可用的契约继续放在 `@deploy-crab/contracts`。

## 数据存储

主机、集群通过 Drizzle ORM 和 better-sqlite3 保存到实例数据目录中的 `deploy-crab.sqlite`。一个数据库文件包含 `hosts`、`clusters`、`cluster_members`、`cluster_member_groups` 四张业务表，以及 Drizzle 的迁移记录表。旧 YAML 文档存储已移除，不做自动导入。

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

Service 保留 Promise 接口，Repository 使用同步查询。`Database.write()` 从业务检查到修改完成使用同一个 IMMEDIATE 事务；`Database.read()` 为相关读取提供一致快照。事务回调必须同步完成，禁止在事务内等待网络或返回 Promise。仓储只接收当前事务的查询能力，不自行提交事务。

数据库保存规范化的 `name_key`，按 JavaScript `toLowerCase()` 判断名称唯一；业务列表保留 `localeCompare()` 排序。成员和分组有独立顺序字段。认证配置仅包含 agent 或私钥路径，和标签一样使用小型 JSON 列；读回时按 contracts 校验，损坏数据会报错。

## 表结构迁移

表定义放在 `src/database/tables/`，每张表一个文件：`hosts.ts`、`clusters.ts`、`cluster-members.ts`、`cluster-member-groups.ts`。`src/database/schema.ts` 只统一导出，供运行时注册；`tables/shares/audit-columns.ts` 提供共享时间字段。Drizzle Kit 直接扫描 `tables/*.ts`。

修改对应表文件后，在仓库根目录执行：

```sh
pnpm --filter @deploy-crab/core db:generate --name=describe_change
```

审查并提交 `migrations/` 中生成的 SQL、journal 和 schema snapshot。已发布的迁移不修改，通过新迁移升级。应用启动时使用 Drizzle migrator 执行尚未应用的迁移；失败会关闭连接并停止启动，不自动重建或清空数据库。

Server 的 Rspack 配置将该目录复制到 `.dev/migrations/` 和 `dist/migrations/`，运行时从入口文件旁读取，不依赖源码目录或启动工作目录。`drizzle-kit` 只用于开发，生产环境只需运行依赖和已生成的迁移文件。

## 验证

```sh
pnpm --filter @deploy-crab/core test
pnpm --filter @deploy-crab/core check-types
pnpm --filter @deploy-crab/core lint
```

主机和集群的 Service 测试各自创建临时 SQLite 数据库并执行迁移，覆盖增删改查、名称唯一性、跳板链和成员引用等业务规则；测试结束后关闭连接并清理临时目录。
