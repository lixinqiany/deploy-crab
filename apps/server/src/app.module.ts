import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ApiExceptionFilter } from './filters/api-exception/api-exception.filter';
import { ZodValidationPipe } from './pipes/zod/zod-validation.pipe';

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
export class AppModule {}
