# @deploy-crab/cli

在仓库根目录使用 `pnpm dev:cli`、`pnpm build:cli`、`pnpm start:cli`。

开发入口 `dev.ts` 使用 tsx，生产入口 `src/index.ts` 使用 tsdown 构建为 ESM。两者共享 `src/bootstrap.tsx`；相对 TypeScript 导入不写扩展名。Turbo 负责监听、重启、类型检查和 lint。在 Turbo 面板按 `i` 进入 CLI 交互。

`pnpm build:cli` 先通过类型检查，再生成完整的 `dist/`。工作区内部依赖打入产物，commander、Ink、React 等第三方依赖由生成的运行清单和裁剪锁文件管理。

把整个 `dist` 复制到其他目录或机器后，在其中执行：

```sh
pnpm install --prod --frozen-lockfile
pnpm start
```

目标机器需要 Node.js 和 pnpm；不需要原仓库、TypeScript 或 tsdown。CLI 支持 `--help`、`--version`，进入界面后按 `q` 退出。生产入口不接受 `--dev`。
