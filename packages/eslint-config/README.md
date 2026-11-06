# @repo/eslint-config

仓库统一使用 ESLint 10 flat config。根目录 `eslint.config.mjs` 调用 `createConfig(import.meta.dirname)`，各应用只运行 `eslint . --max-warnings=0`，规则集中维护在本包。

## 选型依据

采用 ESLint `recommended` 和 typescript-eslint `recommendedTypeChecked`，通过 `projectService` 读取各包的 tsconfig。前者提供基础 JavaScript 检查，后者检查 Promise、any 的不安全传播、错误的类型操作等问题。

这是官方推荐的起点。没有直接启用 `all` 或整个 `strictTypeChecked`：后者包含更多主观约束，官方也说明其规则可能在非 major 升级中调整。当前项目先在推荐集上补充明确有用的规则。[typescript-eslint 配置说明](https://typescript-eslint.io/users/configs/)

格式交给 Prettier，最后应用 `eslint-config-prettier` 关闭冲突规则，不在 ESLint 里重复运行格式化。[Prettier 官方建议](https://prettier.io/docs/integrating-with-linters)

## 规则范围

| 范围                            | 配置与目的                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| JS/TS                           | 推荐规则，加严格相等、禁止 var、优先 const、数组回调返回值检查、禁止重复导入                                  |
| TypeScript                      | 类型感知推荐规则、类型导入自动修复、未使用变量、switch 联合类型/枚举分支完整性、try/catch 中正确 return await |
| CLI、Web、UI 的 `.ts` 和 `.tsx` | React 官方 Hooks 推荐集，覆盖组件和自定义 Hook；补充缺失/重复/index key、重复 children、JSX 注释误写检查      |
| Web/UI 的 `.tsx`                | Vite Fast Refresh 检查，以及 DOM 子元素、script URL、iframe sandbox 等检查                                    |
| Server 测试                     | Vitest 全局变量                                                                                               |
| 全部                            | 无效的 eslint-disable 和冗余行内配置报错；忽略依赖、构建产物、缓存和运行数据                                  |

React 官方 Hooks 插件负责 Hooks 及其推荐的组件检查。JSX/DOM 基础规则由 `@eslint-react/eslint-plugin` 补充，只启用上述必要规则，避免与 Hooks 重复，也不强制迁移现有 React API 或增加命名约束。[React 官方说明](https://react.dev/reference/eslint-plugin-react-hooks)、[ESLint React 的 TypeScript 配置](https://eslint-react.xyz/docs/getting-started/typescript)

本次核对的 `eslint-plugin-react@7.37.5` 与 `eslint-plugin-jsx-a11y@6.10.2` peerDependencies 尚未包含 ESLint 10，因此不强制安装。ESLint React 明确支持 ESLint 10，但上述 DOM 检查不等于完整的可访问性检查；缺少 alt、表单 label、ARIA 等检查仍需在后续接入兼容的 a11y 插件时补齐。Ink 是终端界面，不适用 DOM/a11y 规则。

## 关键约定

- `==` / `!=` 默认禁止，但允许 `value == null`，用来同时判断 null 和 undefined。
- 未使用的参数、变量、catch 绑定和数组解构变量可用 `_` 前缀明确忽略；普通未使用变量仍报错。对象 rest 解构中为排除字段而取出的属性允许不用。
- `switch-exhaustiveness-check` 检查已知联合类型或枚举成员，不要求普通 string/number 的 switch 列举所有可能值。[规则说明](https://typescript-eslint.io/rules/switch-exhaustiveness-check/)
- Promise 必须明确处理；在 try/catch 内返回 Promise 时使用 `return await`，让本层 catch 能捕获异步拒绝。`void promise` 只是明确忽略，不能代替运行时错误处理。
- 类型导入通过 ESLint 提供自动修复；Nest 装饰器文件的元数据由 tsconfig 告知解析器，不会把依赖注入需要的类盲目改为 `import type`。[装饰器注意事项](https://typescript-eslint.io/rules/consistent-type-imports/)
- 同一条导入中有运行时值和类型时可写 `import { value, type T }`；全部都是类型时由 `no-import-type-side-effects` 要求使用 `import type`，避免 `verbatimModuleSyntax` 把它编译为仍会加载模块的 `import {}`。[规则说明](https://typescript-eslint.io/rules/no-import-type-side-effects/)
- TypeScript 负责不可达代码和 switch 穿透，避免 ESLint 重复诊断；未使用变量则统一由 ESLint 负责。
- 保留预设中部分规则的 warning 级别，便于编辑器区分；由于命令带 `--max-warnings=0`，warning 也会使检查失败。
- 不统一禁止 console，不强制每个函数写返回类型，也不强制 import 字母排序；CLI 输出和 TypeScript 类型推断可以正常使用。

## 开发方式

`pnpm dev:cli`、`pnpm dev:server`、`pnpm dev:web` 已通过 Turbo watch 并行执行启动、类型检查和 lint。编辑器通过工作区 ESLint/Prettier 扩展显示问题、保存格式化并应用可自动修复的规则；业务错误仍需手动处理。

```sh
# 全仓库检查和构建
pnpm exec turbo run build check-types lint

# 格式检查
pnpm exec prettier --check .

# 只修复一个应用中的可自动修复问题
pnpm --filter @deploy-crab/web exec eslint . --fix
```

共享包单独依赖 TypeScript 6.0.3，为 typescript-eslint 提供其支持的编译器 API；各应用现有的 TypeScript 编译器版本独立维护。升级时检查 [typescript-eslint 版本兼容范围](https://typescript-eslint.io/users/dependency-versions/)，不要仅因为应用升级就移除该依赖。

TypeScript 分层与具体编译选项见 [TypeScript 配置说明](../typescript-config/README.md)。
