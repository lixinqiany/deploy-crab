import { Module } from '@nestjs/common';
import { Database } from '@deploy-crab/core/database/database';
import { ExecutionService } from '@deploy-crab/core/execution/execution-service';
import { PersistentRunStore } from '@deploy-crab/core/execution/persistent-run-store';
import { SessionService } from '@deploy-crab/core/sessions/session-service';
import { ExecutionModule } from '../execution/execution.module';
import { SessionsController } from './sessions.controller';
import { LocalSecretStore } from '@deploy-crab/core/secrets/local-secret-store';

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
        secrets: LocalSecretStore,
      ) => new SessionService(database, execution, store, secrets),
      inject: [
        Database,
        ExecutionService,
        PersistentRunStore,
        LocalSecretStore,
      ],
    },
  ],
})
export class SessionsModule {}
