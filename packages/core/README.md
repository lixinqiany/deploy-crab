# `@deploy-crab/core`

Node 侧共享的运行逻辑。本包不单独构建，直接导出 TypeScript 源码，由使用方编译：server 的开发与生产构建由 Rspack 把 core 一起打入产物，测试由 Vitest 直接加载源码。交付时不需要额外安装这个私有工作区包。

开发时修改 core，Turbo watch 会重启依赖它的 server。

server 和以后的 CLI 共用这里的代码。每个源文件单独输出，按子路径导入，不提供汇总入口：

| 子路径                                          | 内容                                                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `@deploy-crab/core/utils/data-directory`        | 数据目录解析：调用方传入的路径（server 来自 `--data-dir`）优先，相对路径按启动工作目录解析；未传入时为 `~/.deploy-crab/` |
| `@deploy-crab/core/storage/document-store`      | 存储抽象类 `DocumentStore` / `Collection`，业务代码只依赖它，也可直接作为 Nest 注入 token                                |
| `@deploy-crab/core/storage/file-document-store` | 基于文件的实现 `FileDocumentStore`：每个集合一个目录，每个文档一个文件，读写都用传入的 schema 校验                       |
| `@deploy-crab/core/storage/document-format`     | 文件格式抽象类 `DocumentFormat`：扩展名与解析、序列化方式                                                                |
| `@deploy-crab/core/storage/yaml-format`         | YAML 格式 `YamlFormat`                                                                                                   |
| `@deploy-crab/core/utils/atomic-write`          | 原子写文件                                                                                                               |
| `@deploy-crab/core/utils/mutex`                 | 进程内异步互斥锁                                                                                                         |

`pnpm --filter @deploy-crab/core test` 运行单元测试（`*.spec.ts`，不参与构建）。

本包使用 Node 文件系统 API，不能直接导入浏览器应用。前后端共享的类型、校验或纯函数应放入不含 Node 依赖的工作区包。
