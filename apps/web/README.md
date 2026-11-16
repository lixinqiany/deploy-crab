# @deploy-crab/web

React + Vite 前端，使用 `@deploy-crab/ui` 中的源码组件。根目录命令为 `pnpm dev:web`、`pnpm build:web` 和 `pnpm start:web`。

## UI 与样式

`/tasks` 是任务库，使用书页图标。可以创建任务，编辑内建能力、脚本、其他任务引用、依赖和任务/步骤钩子。保存后可重新打开、复制和删除；被其他任务引用时不能删除，存在未保存修改时关闭编辑器会确认。当前任务库只编辑流程定义，没有运行或 Session 入口。

使用 Ant Design 6 组件和 Tailwind CSS 4 工具类，`apps/web` 和 `packages/ui` 均可从 `antd` 导入组件：

```tsx
import { Button } from 'antd';

export const SubmitButton = () => (
  <Button type="primary" className="mt-4">
    提交
  </Button>
);
```

Tailwind 通过 `@tailwindcss/vite` 接入构建，入口为 `src/style.css`，使用 `@source` 扫描共享 UI 包。新增其他包含工具类的共享包时，需要在这里注册其源码路径。

`src/main.tsx` 配置了 `StyleProvider`、`ConfigProvider` 和 Ant Design 的 `App` 上下文；组件内可通过 `App.useApp()` 使用 `message`、`notification` 和 `modal`。全局 CSS 层级为 `theme, base, antd, components, utilities`，让 Tailwind 工具类可以覆盖 Ant Design 样式。基础样式由 Tailwind Preflight 提供。

## 导入路径

`@/` 指向 `src/`，在 `tsconfig.json` 的 `paths` 中定义，Vite 通过 `resolve.tsconfigPaths` 读取同一份配置：

```ts
import { ApiRequestError } from '@/api/http';
import { sshCommand } from '@/utils/ssh';
import { groupCounts } from './groups';
```

跨目录（`api`、`utils`、`views` 等）用 `@/`；同一功能目录内的文件用 `./`。共享包仍按子路径导入，如 `@deploy-crab/ui/button/CopyButton`。

## 开发与构建

开发时另外启动 `pnpm dev:server`。默认 Web 端口为 5173，后端端口为 3000；使用 `WEB_PORT` 和 `PORT` 覆盖。开发服务与本地预览将 `/api` 代理到后端。

`pnpm build:web` 生成 `dist` 静态资源。`pnpm start:web` 使用 Vite preview，只用于本地预览；正式部署需要静态文件服务器和 `/api` 反向代理。

浏览器代码可以使用 UI 或浏览器兼容的共享包；`@deploy-crab/core` 包含 Node 文件系统逻辑，不应导入这里。
