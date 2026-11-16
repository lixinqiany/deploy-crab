import { HostService } from '@deploy-crab/core/inventory/host-service';
import { Database } from '@deploy-crab/core/database/database';
import { ExecutionService } from '@deploy-crab/core/execution/execution-service';
import { ConnectionResolver } from '@deploy-crab/core/ssh/connection-resolver';
import { Module } from '@nestjs/common';
import { HostsController } from './hosts.controller';
import { ExecutionModule } from '../../execution/execution.module';

@Module({
  imports: [ExecutionModule],
  controllers: [HostsController],
  providers: [
    {
      // HostService 来自 core，没有 Nest 装饰器，用工厂函数注入依赖
      provide: HostService,
      useFactory: (
        database: Database,
        resolver: ConnectionResolver,
        execution: ExecutionService,
      ) => new HostService(database, resolver, execution),
      inject: [Database, ConnectionResolver, ExecutionService],
    },
    {
      provide: ConnectionResolver,
      useFactory: (database: Database) => new ConnectionResolver(database),
      inject: [Database],
    },
  ],
})
export class HostsModule {}
