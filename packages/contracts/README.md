# `@deploy-crab/contracts`

deploy-crab API 的数据定义，用 zod 编写，server、Web 和以后的 CLI 共用：

- server 用它校验请求，并据此生成 OpenAPI 文档；
- Web 用它做表单校验，提示文案和服务端一致；
- CLI 可以直接复用它校验命令参数。

本包不依赖 Node 或浏览器 API，以源码形式按子路径导入，不提供汇总入口：

```ts
import { Host, CreateHostInput } from '@deploy-crab/contracts/host';
import { ApiError } from '@deploy-crab/contracts/error';
```

目录约定：

| 位置                            | 内容                                                     |
| ------------------------------- | -------------------------------------------------------- |
| `src/<资源>.ts`                 | 某种资源的 schema，如 `host.ts`                          |
| `src/fields.ts`、`src/error.ts` | 多种资源共用的字段规则、统一错误格式                     |
| `src/enums/<领域>.ts`           | 枚举，用 `z.enum` 定义并导出同名类型                     |
| `src/constants/<领域>.ts`       | 常量，如 `constants/runtime.ts` 的 `DATA_DIRECTORY_NAME` |

同名导出的 schema 和类型可以同时使用：`Host.parse(data)` 做校验，`Host` 作类型标注。需要出现在 OpenAPI 组件中的 schema 用 `.meta({ id })` 命名，生成的客户端类型会沿用这个名字。

`task.ts` 定义用户任务、步骤调用、任务引用及钩子，包含步骤依赖图的结构校验。`CreateTaskInput` 用于创建，`UpdateTaskInput` 用于携带当前 revision 完整替换；跨任务引用存在性、引用循环和删除保护由 core 在数据库事务内检查。任务定义与 `execution.ts` 中的运行状态分开，保存定义不会创建 Run。

`task-input.ts` 定义任务参数声明与值的校验、默认值解析；`task-input-bindings.ts` 定义引用任务的 `inputBindings`，并提供共享的静态映射校验及调用时的解析函数。绑定规则与 `input` 固定值分开，同一目标字段不能重复赋值；来源必须显式声明，不隐式继承父任务参数。调用时解析按“父默认值与传入值 → 映射 → 子默认值与校验”的顺序进行。
