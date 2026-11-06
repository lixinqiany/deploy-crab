# `@deploy-crab/core`

CLI 与 Server 共用的运行逻辑。使用 tsdown 构建 ESM、`.d.ts` 和 source maps；类型声明通过独立声明转换生成，完整类型检查由 Turbo 的 `check-types` 前置任务完成。

应用开发时通过包名读取这里的构建产物，Turbo 负责先构建并在依赖变化后重启应用。生产构建把 core 的运行代码直接打入应用，交付时不需要额外安装这个私有工作区包。
