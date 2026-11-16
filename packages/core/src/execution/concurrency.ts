import { checkAborted } from './execution-failure';

/** 同一个额度覆盖整个 Step（含 hooks）；Run hooks 单独取得额度。 */
export class Concurrency {
  #active = 0;
  readonly #waiting: (() => void)[] = [];

  constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1)
      throw new Error('并发数必须是正整数');
  }

  async use<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
    checkAborted(signal);
    await new Promise<void>((resolve, reject) => {
      const start = () => {
        signal.removeEventListener('abort', abort);
        this.#active++;
        resolve();
      };
      const abort = () => {
        const index = this.#waiting.indexOf(start);
        if (index >= 0) this.#waiting.splice(index, 1);
        try {
          checkAborted(signal);
        } catch (error) {
          reject(error instanceof Error ? error : new Error('执行已取消'));
        }
      };
      if (this.#active < this.limit) start();
      else {
        this.#waiting.push(start);
        signal.addEventListener('abort', abort, { once: true });
      }
    });
    try {
      checkAborted(signal);
      return await operation();
    } finally {
      this.#active--;
      this.#waiting.shift()?.();
    }
  }
}
