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
