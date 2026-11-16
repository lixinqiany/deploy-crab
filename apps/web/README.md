# @deploy-crab/web

React + Vite 前端，使用 `@deploy-crab/ui` 中的源码组件。根目录命令为 `pnpm dev:web`、`pnpm build:web` 和 `pnpm start:web`。

## UI 与样式

`/tasks` 是任务库，使用书页图标。可以创建任务，编辑内建能力、脚本、其他任务引用、依赖和任务/步骤钩子。保存后可重新打开、复制和删除；被其他任务引用时不能删除，存在未保存修改时关闭编辑器会确认。当前任务库只编辑流程定义，没有运行或 Session 入口。

步骤编辑器的“允许跳过”开关保存 `skippable` 标记，默认关闭；步骤列表和详情页会标注“可跳过”，复制任务或步骤会保留设置。它只声明后续 Session 执行时可供选择，开启不代表现在跳过；实际执行选择与调度留到 Session 阶段。

任务支持自定义标签并复用已有标签。任务库支持多标签交集筛选；步骤和钩子的任务引用选择器合并成一个弹层，可直接搜索名称、说明和标签，或通过“按标签浏览 → 标签 → 任务”分层选择。搜索忽略大小写，空白分隔的关键词须全部匹配；从标签目录输入搜索词会回到全局搜索。

创建任务时通过参数卡配置字段名、显示名称、说明、文本/数字/布尔/JSON 类型、必填状态和可选默认值。必填字段不设置默认值，定义本身不需要填写调用值。引用任务时每个字段选择“不传值”“固定值”或“绑定当前任务参数”，绑定来源下拉框使用正在编辑的父参数声明，不兼容类型不可选。未绑定的必填字段缺值、错误类型或无效绑定不能保存；已绑定的必填字段在实际调用时检查值。false、0、空字符串都可显式传入；选择“不传值”才使用子默认值。步骤和两层钩子的草稿归整个编辑器管理，切换传值方式、步骤、重排和复制均保留未完成输入。详情页展示固定值及参数绑定方向。

脚本编辑器提供“脚本如何读取任务参数”，根据当前字段生成可复制的 Python 3 示例；执行时通过 `DEPLOY_CRAB_INPUT` 读取校验及合并默认值后的 JSON。字段声明保存在现有 `tasks.definition.parameters`，固定值在 `call.input`，绑定在 `call.inputBindings`，无需改表；旧任务的参数声明默认为空数组。父参数有值时显式传入子字段，缺值时按子默认值和必填规则处理。当前没有已保存任务的运行入口，引用传参先保存，等待后续子任务编排接入。

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
