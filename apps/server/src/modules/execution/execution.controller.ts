import { ResourceId } from '@deploy-crab/contracts/fields';
import type { Run } from '@deploy-crab/contracts/execution';
import { ExecutionService } from '@deploy-crab/core/execution/execution-service';
import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { createZodDto } from '@/utils/zod-dto';

class RunParamsDto extends createZodDto(z.object({ id: ResourceId })) {}

@Controller('runs')
export class ExecutionController {
  constructor(private readonly execution: ExecutionService) {}

  @Get(':id')
  get(@Param() { id }: RunParamsDto): Run {
    return this.execution.get(id);
  }

  @Get(':id/tree')
  tree(@Param() { id }: RunParamsDto) {
    return this.execution.tree(id);
  }

  @Post(':id/cancel')
  @HttpCode(202)
  cancel(@Param() { id }: RunParamsDto): Run {
    return this.execution.cancel(id);
  }
}
