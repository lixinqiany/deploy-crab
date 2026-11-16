import { ClusterService } from '@deploy-crab/core/inventory/cluster-service';
import { Database } from '@deploy-crab/core/database/database';
import { Module } from '@nestjs/common';
import { ClustersController } from './clusters.controller';

@Module({
  controllers: [ClustersController],
  providers: [
    {
      // ClusterService 来自 core，没有 Nest 装饰器，用工厂函数创建并注入存储
      provide: ClusterService,
      useFactory: (database: Database) => new ClusterService(database),
      inject: [Database],
    },
  ],
})
export class ClustersModule {}
