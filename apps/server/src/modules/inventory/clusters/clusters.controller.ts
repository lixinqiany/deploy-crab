import type { Cluster } from '@deploy-crab/contracts/cluster';
import { ClusterService } from '@deploy-crab/core/inventory/cluster-service';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
// DTO 必须用值导入：参数类型要保留到运行时，校验 pipe 才能拿到 schema
import {
  ClusterParamsDto,
  CreateClusterDto,
  UpdateClusterDto,
} from './clusters.dto';

/**
 * 集群的 HTTP 接口。只负责把请求转给 `ClusterService`：
 * 参数校验由全局 pipe 完成，业务错误由全局过滤器翻译成响应。
 */
@Controller('clusters')
export class ClustersController {
  constructor(private readonly clusters: ClusterService) {}

  @Get()
  list(): Promise<Cluster[]> {
    return this.clusters.list();
  }

  @Get(':id')
  get(@Param() { id }: ClusterParamsDto): Promise<Cluster> {
    return this.clusters.get(id);
  }

  @Post()
  create(@Body() body: CreateClusterDto): Promise<Cluster> {
    return this.clusters.create(body);
  }

  @Patch(':id')
  update(
    @Param() { id }: ClusterParamsDto,
    @Body() body: UpdateClusterDto,
  ): Promise<Cluster> {
    return this.clusters.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param() { id }: ClusterParamsDto): Promise<void> {
    return this.clusters.delete(id);
  }
}
