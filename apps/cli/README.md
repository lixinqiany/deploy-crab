# @deploy-crab/cli

在仓库根目录使用 `pnpm dev:cli`、`pnpm build:cli`、`pnpm start:cli`。

开发入口 `dev.ts` 使用 tsx，生产入口 `src/index.ts` 使用 tsdown 构建为 ESM。两者共享 `src/bootstrap.tsx`；相对 TypeScript 导入不写扩展名。Turbo 负责监听、重启、类型检查和 lint。在 Turbo 面板按 `i` 进入 CLI 交互。

## 断点调试

在 VS Code 中打开仓库根目录，进入“运行和调试”，选择 `CLI: Debug` 并按 F5。它会启动现有的 `pnpm dev:cli`，调试器自动连接到 tsx 运行的应用进程，保存源码后继续跟随新进程。

直接在 `src/` 下的 TypeScript/TSX 文件设置断点。CLI 使用集成终端接收键盘输入：在 Turbo 面板按 `i` 进入交互，再按 `q` 退出 CLI；停止整个调试会话或在终端按 Ctrl+C 可以结束开发进程。暂停在断点时，终端界面会暂时停止响应，继续执行后恢复。

tsx 在运行时生成源码映射。调试配置允许解析项目内的这些映射，并等待映射就绪后执行，以便启动阶段的 TypeScript/TSX 断点也能命中。

## 构建与交付

`pnpm build:cli` 先通过类型检查，再生成完整的 `dist/`。工作区内部依赖打入产物，commander、Ink、React 等第三方依赖由生成的运行清单和裁剪锁文件管理。

把整个 `dist` 复制到其他目录或机器后，在其中执行：

```sh
pnpm install --prod --frozen-lockfile
pnpm start
```

目标机器需要 Node.js 和 pnpm；不需要原仓库、TypeScript 或 tsdown。CLI 支持 `--help`、`--version`，进入界面后按 `q` 退出。生产入口不接受 `--dev`。
