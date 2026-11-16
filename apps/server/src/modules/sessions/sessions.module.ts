import { Module } from '@nestjs/common';
import { Database } from '@deploy-crab/core/database/database';
import { ExecutionService } from '@deploy-crab/core/execution/execution-service';
import { PersistentRunStore } from '@deploy-crab/core/execution/persistent-run-store';
import { SessionService } from '@deploy-crab/core/sessions/session-service';
import { ExecutionModule } from '../execution/execution.module';
import { SessionsController } from './sessions.controller';

@Module({
  imports: [ExecutionModule],
  controllers: [SessionsController],
  providers: [
    {
      provide: SessionService,
      useFactory: (
        database: Database,
        execution: ExecutionService,
        store: PersistentRunStore,
      ) => new SessionService(database, execution, store),
      inject: [Database, ExecutionService, PersistentRunStore],
    },
  ],
})
export class SessionsModule {}
