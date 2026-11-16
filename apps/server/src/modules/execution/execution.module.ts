import { sshProbeAction } from '@deploy-crab/core/actions/ssh-probe';
import { sshExecAction } from '@deploy-crab/core/actions/ssh-exec';
import { ActionRegistry } from '@deploy-crab/core/execution/action-registry';
import { ExecutionService } from '@deploy-crab/core/execution/execution-service';
import { PersistentRunStore } from '@deploy-crab/core/execution/persistent-run-store';
import { Database } from '@deploy-crab/core/database/database';
import { OpenSshRunner } from '@deploy-crab/core/ssh/open-ssh-runner';
import { SshRunner } from '@deploy-crab/core/ssh/ssh-runner';
import { Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { ExecutionController } from './execution.controller';
import { LocalSecretStore } from '@deploy-crab/core/secrets/local-secret-store';

@Module({
  controllers: [ExecutionController],
  providers: [
    { provide: SshRunner, useClass: OpenSshRunner },
    {
      provide: PersistentRunStore,
      useFactory: (database: Database) => new PersistentRunStore(database),
      inject: [Database],
    },
    {
      provide: ExecutionService,
      useFactory: (
        runner: SshRunner,
        store: PersistentRunStore,
        secrets: LocalSecretStore,
      ) =>
        new ExecutionService(
          new ActionRegistry()
            .register(sshProbeAction(runner))
            .register(sshExecAction(runner, (id) => secrets.resolve(id))),
          store,
        ),
      inject: [SshRunner, PersistentRunStore, LocalSecretStore],
    },
  ],
  exports: [ExecutionService, PersistentRunStore],
})
export class ExecutionModule implements OnModuleDestroy {
  constructor(
    @Inject(ExecutionService) private readonly execution: ExecutionService,
  ) {}
  async onModuleDestroy(): Promise<void> {
    await this.execution.close();
  }
}
