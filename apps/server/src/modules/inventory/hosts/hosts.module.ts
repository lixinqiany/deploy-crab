import { HostService } from '@deploy-crab/core/inventory/host-service';
import { Database } from '@deploy-crab/core/database/database';
import { Module } from '@nestjs/common';
import { HostsController } from './hosts.controller';

@Module({
  controllers: [HostsController],
  providers: [
    {
      // HostService 来自 core，没有 Nest 装饰器，用工厂函数创建并注入存储
      provide: HostService,
      useFactory: (database: Database) => new HostService(database),
      inject: [Database],
    },
  ],
})
export class HostsModule {}
