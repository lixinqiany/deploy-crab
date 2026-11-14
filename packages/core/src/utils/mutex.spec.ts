import { describe, expect, it } from 'vitest';
import { Mutex } from './mutex';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Mutex', () => {
  it('按调用顺序逐个执行，任务之间不交错', async () => {
    const mutex = new Mutex();
    const events: string[] = [];
    const task = (name: string, ms: number) => () =>
      (async () => {
        events.push(`${name} start`);
        await delay(ms);
        events.push(`${name} end`);
        return name;
      })();

    const results = await Promise.all([
      mutex.run(task('a', 20)),
      mutex.run(task('b', 1)),
    ]);

    expect(results).toEqual(['a', 'b']);
    expect(events).toEqual(['a start', 'a end', 'b start', 'b end']);
  });

  it('前一个任务失败不影响后续任务', async () => {
    const mutex = new Mutex();
    const failed = mutex.run(() => Promise.reject(new Error('boom')));
    const next = mutex.run(() => Promise.resolve('ok'));
    await expect(failed).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
  });
});
