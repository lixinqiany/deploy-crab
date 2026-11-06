# @repo/typescript-config

仓库内共享的 TypeScript 配置。应用和源码包通过 `extends` 选择运行环境，各自维护文件范围和构建产物路径。

```text
base.json
├── node.json   → CLI、Server、core
└── react.json  → Web、UI
```

| 配置         | 职责                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------- |
| `base.json`  | 通用严格检查、模块互操作和单文件编译兼容选项，不指定运行环境或输出策略                   |
| `node.json`  | ES2023、Node 类型、NodeNext 模块解析；开启索引访问和可选属性的严格检查                   |
| `react.json` | 浏览器 DOM 类型、React JSX、Bundler 模块解析、仅类型检查；Web 和 UI 源码统一由 Vite 构建 |

例如 CLI 运行在 Node.js 中，并使用 Ink 渲染 JSX，因此继承 Node 配置后在本地开启 JSX：

```json
{
  "extends": "@repo/typescript-config/node.json",
  "include": ["src", "dev.ts"],
  "exclude": ["node_modules", "dist", ".dev", "coverage"],
  "compilerOptions": {
    "noEmit": true,
    "jsx": "react-jsx"
  }
}
```

CLI 的 `tsconfig.build.json` 再继承此文件，开启输出、指定 `src → dist`，并排除开发入口。Server 在本地保留 Nest 的装饰器设置，开发和生产分别编译到 `.dev/`、`dist/`。core 在本地开启 JavaScript、类型声明及源码映射输出。

Web 与 UI 的运行环境和构建方式相同，因此共用 `react.json`，各自只声明文件范围。将来 UI 需要独立发布并生成 JavaScript、类型声明时，再增加自己的 `tsconfig.build.json`。

`include`、`exclude`、`rootDir`、`outDir`、增量编译缓存路径均放在使用方配置中。TypeScript 按声明路径的配置文件位置解析相对路径；放在共享包中会使路径指向共享包自身。[TypeScript 官方继承规则](https://www.typescriptlang.org/tsconfig/extends.html)

使用方需要在 `devDependencies` 声明 `"@repo/typescript-config": "workspace:*"`。这既让 pnpm 链接配置包，也让 Turbo 将配置包识别为依赖，配置变化后重新计算相关任务缓存。

新增应用时，从现有预设中选择运行环境；框架独有选项先留在应用配置中，多个应用确实共用时再提取预设。Node.js 与打包器采用不同的模块解析规则，分别使用 NodeNext 和 Bundler。[TypeScript 官方模块解析说明](https://www.typescriptlang.org/tsconfig/moduleResolution.html)
