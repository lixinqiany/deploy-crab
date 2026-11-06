# @deploy-crab/server

在仓库根目录使用 `pnpm dev:server`、`pnpm build:server`、`pnpm start:server`，这些命令只负责后端 API。

Web 和 Server 分别启动。开发时在两个终端执行 `pnpm dev:server` 和 `pnpm dev:web`；使用构建产物时，先分别执行 `pnpm build:server`、`pnpm build:web`，再在两个终端执行 `pnpm start:server` 和 `pnpm start:web`。`start:web` 使用 Vite 自带的 `vite preview`，用于在本机预览构建后的前端。

后端默认监听 `127.0.0.1:3000`，可用 `PORT` 修改。前端默认监听 `127.0.0.1:5173`，可用 `WEB_PORT` 修改；Vite 开发服务和构建预览都将 `/api` 转发到后端。如修改后端端口，在前后端两个命令中设置相同的 `PORT`。

开发入口 `dev.ts` 编译到 `.dev/`；生产入口 `src/main.ts` 编译到 `dist/main.js`，共用 `src/bootstrap.ts`。Turbo 监听后端和 core 的变化并重启，正式启动只运行构建后的 JavaScript。开发数据目录为仓库下的 `.deploy-crab/`，生产数据目录为 `~/.deploy-crab/`。

Nest CLI 使用 Rspack builder，保留内置 SWC 的装饰器及元数据处理。`rspack.config.ts` 选择开发或生产入口，将工作区运行依赖打入产物，并把第三方依赖保留为 ESM 引用。源码的相对 TypeScript 导入不写扩展名。Node 的 `import.meta` 和运行时 URL 保留到运行阶段，避免将数据目录当作待打包资源。

根目录的构建命令会先通过完整类型检查。构建后的 `dist` 包含运行入口、JS 分块、source maps、运行用 `package.json`、裁剪后的 `pnpm-lock.yaml` 和独立安装设置。复制整个目录到目标机器，在里面执行：

```sh
pnpm install --prod --frozen-lockfile
pnpm start
```

目标机器需要 Node.js 和 pnpm，不需要 Nest CLI、Rspack、TypeScript 或原仓库。`assets/` 中的应用资源会被复制到 `dist/assets/`。
