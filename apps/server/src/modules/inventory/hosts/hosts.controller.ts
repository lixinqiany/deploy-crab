import type { Host } from '@deploy-crab/contracts/host';
import type { Run } from '@deploy-crab/contracts/execution';
import { HostService } from '@deploy-crab/core/inventory/host-service';
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
  CheckHostDto,
  CreateHostDto,
  HostParamsDto,
  UpdateHostDto,
} from './hosts.dto';

/**
 * 主机的 HTTP 接口。只负责把请求转给 `HostService`：
 * 参数校验由全局 pipe 完成，业务错误由全局过滤器翻译成响应。
 */
@Controller('hosts')
export class HostsController {
  constructor(private readonly hosts: HostService) {}

  @Post('check-connection')
  @HttpCode(HttpStatus.ACCEPTED)
  check(@Body() body: CheckHostDto): Promise<Run> {
    return this.hosts.checkConnection(body);
  }

  @Get()
  list(): Promise<Host[]> {
    return this.hosts.list();
  }

  @Get(':id')
  get(@Param() { id }: HostParamsDto): Promise<Host> {
    return this.hosts.get(id);
  }

  @Post()
  create(@Body() body: CreateHostDto): Promise<Host> {
    return this.hosts.create(body);
  }

  @Patch(':id')
  update(
    @Param() { id }: HostParamsDto,
    @Body() body: UpdateHostDto,
  ): Promise<Host> {
    return this.hosts.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param() { id }: HostParamsDto): Promise<void> {
    return this.hosts.delete(id);
  }
}
