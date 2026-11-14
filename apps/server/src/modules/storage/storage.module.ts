import { join } from 'node:path';
import { DocumentStore } from '@deploy-crab/core/storage/document-store';
import { FileDocumentStore } from '@deploy-crab/core/storage/file-document-store';
import { YamlFormat } from '@deploy-crab/core/storage/yaml-format';
import { type DynamicModule, Logger, Module } from '@nestjs/common';

export interface StorageModuleOptions {
  /** 实例数据目录；文档放在它下面的 `store/` 子目录，给日志等其他数据留出位置 */
  dataDirectory: string;
}

/**
 * 提供 `DocumentStore`。业务模块在构造函数里声明 `store: DocumentStore` 即可使用，
 * 不需要知道底层是 YAML 文件还是别的实现。
 *
 * 声明为全局模块，只需在 AppModule 里 `forRoot` 一次。
 */
@Module({})
export class StorageModule {
  static forRoot({ dataDirectory }: StorageModuleOptions): DynamicModule {
    return {
      module: StorageModule,
      global: true,
      providers: [
        {
          // 抽象类作为 token，具体用哪种实现只在这里决定
          provide: DocumentStore,
          useFactory: () => StorageModule.createStore(dataDirectory),
        },
      ],
      exports: [DocumentStore],
    };
  }

  private static createStore(dataDirectory: string): DocumentStore {
    const logger = new Logger(DocumentStore.name);
    return new FileDocumentStore(
      join(dataDirectory, 'store'),
      new YamlFormat(),
      {
        onInvalidDocument: (file, error) =>
          logger.warn(`Skipped invalid document ${file}: ${String(error)}`),
      },
    );
  }
}
