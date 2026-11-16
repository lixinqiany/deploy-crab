import { Database } from '@deploy-crab/core/database/database';
import { TaskService } from '@deploy-crab/core/tasks/task-service';
import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';

@Module({
  controllers: [TasksController],
  providers: [
    {
      provide: TaskService,
      useFactory: (database: Database) => new TaskService(database),
      inject: [Database],
    },
  ],
})
export class TasksModule {}
