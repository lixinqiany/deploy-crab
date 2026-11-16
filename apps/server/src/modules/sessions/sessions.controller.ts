import { z } from 'zod';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CreateSessionInput,
  UpdateSessionInput,
  ExecuteSessionTask,
} from '@deploy-crab/contracts/session';
import { ResourceId } from '@deploy-crab/contracts/fields';
import { SessionService } from '@deploy-crab/core/sessions/session-service';
import { createZodDto } from '@/utils/zod-dto';

class CreateSessionDto extends createZodDto(CreateSessionInput) {}
class UpdateSessionDto extends createZodDto(UpdateSessionInput) {}
class ExecuteSessionDto extends createZodDto(ExecuteSessionTask) {}
class SessionParamsDto extends createZodDto(z.object({ id: ResourceId })) {}
class HistoryQueryDto extends createZodDto(
  z.object({
    before: ResourceId.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
) {}

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionService) {}
  @Get() list() {
    return this.sessions.list();
  }
  @Post() create(@Body() body: CreateSessionDto) {
    return this.sessions.create(body);
  }
  @Get(':id') get(@Param() { id }: SessionParamsDto) {
    return this.sessions.get(id);
  }
  @Patch(':id') update(
    @Param() { id }: SessionParamsDto,
    @Body() body: UpdateSessionDto,
  ) {
    return this.sessions.update(id, body);
  }
  @Delete(':id') @HttpCode(204) delete(@Param() { id }: SessionParamsDto) {
    this.sessions.delete(id);
  }
  @Get(':id/runs') history(
    @Param() { id }: SessionParamsDto,
    @Query() query: HistoryQueryDto,
  ) {
    return this.sessions.history(id, query.before, query.limit);
  }
  @Post(':id/runs') @HttpCode(202) execute(
    @Param() { id }: SessionParamsDto,
    @Body() body: ExecuteSessionDto,
  ) {
    return this.sessions.execute(id, body);
  }
}
