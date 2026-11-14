import { Module } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ZodValidationPipe } from './pipes/zod/zod-validation.pipe';

@Module({
  controllers: [AppController],
  providers: [
    AppService,
    // 在模块里注册全局 pipe（而不是在 bootstrap 里 useGlobalPipes），
    // 这样基于 AppModule 的 e2e 测试也会经过同样的校验
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
})
export class AppModule {}
