import type { Task, TaskCatalog } from '@deploy-crab/contracts/task';
import { TaskService } from '@deploy-crab/core/tasks/task-service';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { CreateTaskDto, TaskParamsDto, UpdateTaskDto } from './tasks.dto';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TaskService) {}
  @Get('catalog')
  catalog(): TaskCatalog {
    return this.tasks.catalog();
  }
  @Get()
  list(): Task[] {
    return this.tasks.list();
  }
  @Get(':id')
  get(@Param() { id }: TaskParamsDto): Task {
    return this.tasks.get(id);
  }
  @Post()
  create(@Body() body: CreateTaskDto): Task {
    return this.tasks.create(body);
  }
  @Put(':id')
  update(@Param() { id }: TaskParamsDto, @Body() body: UpdateTaskDto): Task {
    return this.tasks.update(id, body);
  }
  @Delete(':id')
  @HttpCode(204)
  delete(@Param() { id }: TaskParamsDto): void {
    this.tasks.delete(id);
  }
}
