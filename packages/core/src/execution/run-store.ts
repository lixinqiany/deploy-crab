import {
  isExecutionFinished,
  type Run,
} from '@deploy-crab/contracts/execution';
import { ConflictError } from '../errors/domain-error';

/** 保存记录与执行逻辑分离；持久化实现可以在此边界另行接入。 */
export abstract class RunStore {
  abstract get(id: string): Run | undefined;
  abstract list(): Run[];
  abstract create(run: Run): void;
  abstract save(run: Run): void;
}

export class MemoryRunStore extends RunStore {
  readonly #runs = new Map<string, Run>();

  constructor(
    private readonly ttlMs = 10 * 60_000,
    private readonly maxRuns = 200,
    private readonly now: () => number = Date.now,
  ) {
    super();
  }

  get(id: string): Run | undefined {
    this.prune();
    const run = this.#runs.get(id);
    return run && structuredClone(run);
  }

  list(): Run[] {
    this.prune();
    return [...this.#runs.values()].map((run) => structuredClone(run));
  }

  create(run: Run): void {
    this.prune();
    if (this.#runs.size >= this.maxRuns) {
      throw new ConflictError('临时执行数量达到上限，请稍后重试');
    }
    if (this.#runs.has(run.id)) throw new ConflictError('执行 id 已存在');
    this.save(run);
  }

  save(run: Run): void {
    this.#runs.set(run.id, structuredClone(run));
  }

  /** 正在被未完成 Run 依赖的结果不能过期。 */
  private prune(): void {
    const referenced = new Set(
      [...this.#runs.values()]
        .filter((r) => !isExecutionFinished(r.status))
        .flatMap((r) => r.dependsOn),
    );
    for (const [id, run] of this.#runs) {
      if (
        run.finishedAt &&
        !referenced.has(id) &&
        this.now() - Date.parse(run.finishedAt) >= this.ttlMs
      ) {
        this.#runs.delete(id);
      }
    }
  }
}
