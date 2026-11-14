import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ApiExceptionFilter } from './filters/api-exception/api-exception.filter';
import { StorageModule } from './modules/storage/storage.module';
import { ZodValidationPipe } from './pipes/zod/zod-validation.pipe';

export interface AppModuleOptions {
  /** 实例数据目录，由启动参数 `--data-dir` 决定；测试时传入临时目录 */
  dataDirectory: string;
}

@Module({
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
  /** 数据目录要到启动时才知道，所以用 forRoot 在运行时传入 */
  static forRoot({ dataDirectory }: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [StorageModule.forRoot({ dataDirectory })],
    };
  }
}
