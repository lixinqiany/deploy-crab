# @deploy-crab/server

在仓库根目录使用 `pnpm dev:server`、`pnpm build:server`、`pnpm start:server`，这些命令只负责后端 API。

Web 和 Server 分别启动。开发时在两个终端执行 `pnpm dev:server` 和 `pnpm dev:web`；使用构建产物时，先分别执行 `pnpm build:server`、`pnpm build:web`，再在两个终端执行 `pnpm start:server` 和 `pnpm start:web`。`start:web` 使用 Vite 自带的 `vite preview`，用于在本机预览构建后的前端。

后端默认监听 `127.0.0.1:3000`，可用 `PORT` 修改。前端默认监听 `127.0.0.1:5173`，可用 `WEB_PORT` 修改；Vite 开发服务和构建预览都将 `/api` 转发到后端。如修改后端端口，在前后端两个命令中设置相同的 `PORT`。

开发入口 `dev.ts` 编译到 `.dev/`；生产入口 `src/main.ts` 编译到 `dist/main.js`，共用 `src/bootstrap.ts`。Turbo 监听后端和 core 的变化并重启，正式启动只运行构建后的 JavaScript。开发数据目录为仓库下的 `.deploy-crab/`，生产数据目录为 `~/.deploy-crab/`。
