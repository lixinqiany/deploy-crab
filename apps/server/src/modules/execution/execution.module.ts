import { sshProbeAction } from '@deploy-crab/core/actions/ssh-probe';
import { ActionRegistry } from '@deploy-crab/core/execution/action-registry';
import { ExecutionService } from '@deploy-crab/core/execution/execution-service';
import { MemoryRunStore } from '@deploy-crab/core/execution/run-store';
import { OpenSshRunner } from '@deploy-crab/core/ssh/open-ssh-runner';
import { SshRunner } from '@deploy-crab/core/ssh/ssh-runner';
import { Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { ExecutionController } from './execution.controller';

@Module({
  controllers: [ExecutionController],
  providers: [
    { provide: SshRunner, useClass: OpenSshRunner },
    {
      provide: ExecutionService,
      useFactory: (runner: SshRunner) =>
        new ExecutionService(
          new ActionRegistry().register(sshProbeAction(runner)),
          new MemoryRunStore(),
        ),
      inject: [SshRunner],
    },
  ],
  exports: [ExecutionService],
})
export class ExecutionModule implements OnModuleDestroy {
  constructor(
    @Inject(ExecutionService) private readonly execution: ExecutionService,
  ) {}
  async onModuleDestroy(): Promise<void> {
    await this.execution.close();
  }
}
