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
| `node.json`  | ES2023、Node 类型、NodeNext 模块解析；类型错误时不生成新的构建产物                       |
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

## 通用检查策略

CLI、Server、core、Web 和 UI 都继承以下检查，避免同一段业务类型在前后端表现不同。

| 选项                           | 用途                                                                |
| ------------------------------ | ------------------------------------------------------------------- |
| `strict`                       | 开启隐式 any、空值、函数参数、未知 catch 错误等严格检查             |
| `noUncheckedIndexedAccess`     | 数组和字典按索引取值时，要求考虑元素不存在的情况                    |
| `exactOptionalPropertyTypes`   | 区分属性不存在与显式赋值 `undefined`；需要后者时明确写入类型        |
| `noImplicitOverride`           | 重写父类成员必须使用 `override`，便于重构时发现遗漏                 |
| `noImplicitReturns`            | 检查有返回值的函数是否遗漏返回分支；允许普通 void 函数              |
| `noFallthroughCasesInSwitch`   | 防止非空 case 意外落入下一个分支                                    |
| `noUncheckedSideEffectImports` | 检查无法解析的副作用导入，例如拼错的模块名                          |
| `allowUnreachableCode: false`  | 报告 return/throw 等语句后确定无法执行的代码                        |
| `allowUnusedLabels: false`     | 报告未使用的标签，避免把对象属性误写成标签语句                      |
| `verbatimModuleSyntax`         | 明确区分运行时导入与 `import type`；不隐式改写 ESM 为 CommonJS      |
| `isolatedModules`              | 确保代码兼容 Vite、tsx 等逐文件转译工具                             |
| `moduleDetection: force`       | 普通源码文件按模块处理，避免无 import/export 的文件意外声明全局变量 |

`noUnusedLocals` / `noUnusedParameters` 不在 TypeScript 中重复启用：统一由 ESLint 的 `@typescript-eslint/no-unused-vars` 检查，支持 `_` 前缀和对象 rest 解构等细粒度例外。这也避免开发中临时未使用的变量阻断 TypeScript 编译；lint 仍然会失败。[typescript-eslint 官方建议](https://typescript-eslint.io/rules/no-unused-vars/)

`skipLibCheck` 保留为 `true`，减少第三方声明文件的检查开销；它不会关闭业务源码的类型检查。Server 保留 `strictPropertyInitialization: false` 以适配 Nest 的属性注入，装饰器和元数据选项也只在 Server 开启。

Node 预设的 `noEmitOnError` 阻止有类型错误的编译写出新文件，但不会删除已有的 `dist`。Web/UI 保持 `noEmit`，由 Vite 生成最终资源。React 预设没有启用 `erasableSyntaxOnly`，不额外限制当前编译工具支持的 TypeScript 语法。

Web 的 `vite/client` 声明允许 CSS 等资源导入。`noUncheckedSideEffectImports` 只能校验模块能否被类型系统解析；已有 `*.css` 通配声明时，CSS 文件是否真实存在仍由 Vite 构建检查。[TypeScript 官方说明](https://www.typescriptlang.org/tsconfig/noUncheckedSideEffectImports.html)

规则与开发命令见 [ESLint 配置说明](../eslint-config/README.md)。
