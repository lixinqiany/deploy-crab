import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ApiExceptionFilter } from './filters/api-exception/api-exception.filter';
import { HostsModule } from './modules/inventory/hosts/hosts.module';
import { StorageModule } from './modules/storage/storage.module';
import { ZodValidationPipe } from './pipes/zod/zod-validation.pipe';

export interface AppModuleOptions {
  /** 实例数据目录，由启动参数 `--data-dir` 决定；测试时传入临时目录 */
  dataDirectory: string;
}

@Module({
  // 不需要启动参数的模块直接写在这里
  imports: [HostsModule],
  controllers: [AppController],
  providers: [
    AppService,
    // 在模块里注册全局 pipe 和过滤器（而不是在 bootstrap 里 useGlobal*），
    // 这样基于 AppModule 的 e2e 测试也会经过同样的处理
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {
  /**
   * 数据目录要到启动时才知道，所以需要它的模块在这里传入；
   * 返回的 imports 会和 `@Module` 里的 imports 合并。
   */
  static forRoot({ dataDirectory }: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [StorageModule.forRoot({ dataDirectory })],
    };
  }
}
