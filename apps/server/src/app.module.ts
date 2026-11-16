import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ApiExceptionFilter } from './filters/api-exception/api-exception.filter';
import { ClustersModule } from './modules/inventory/clusters/clusters.module';
import { HostsModule } from './modules/inventory/hosts/hosts.module';
import {
  DatabaseModule,
  type DatabaseModuleOptions,
} from './modules/database/database.module';
import { ZodValidationPipe } from './pipes/zod/zod-validation.pipe';

export type AppModuleOptions = DatabaseModuleOptions;

@Module({
  // 不需要启动参数的模块直接写在这里
  imports: [HostsModule, ClustersModule],
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
  static forRoot(options: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [DatabaseModule.forRoot(options)],
    };
  }
}
