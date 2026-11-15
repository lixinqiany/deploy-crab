import { ClusterService } from '@deploy-crab/core/inventory/cluster-service';
import { DocumentStore } from '@deploy-crab/core/storage/document-store';
import { Module } from '@nestjs/common';
import { ClustersController } from './clusters.controller';

@Module({
  controllers: [ClustersController],
  providers: [
    {
      // ClusterService 来自 core，没有 Nest 装饰器，用工厂函数创建并注入存储
      provide: ClusterService,
      useFactory: (store: DocumentStore) => new ClusterService(store),
      inject: [DocumentStore],
    },
  ],
})
export class ClustersModule {}
