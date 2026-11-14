/**
 * 进程内的异步互斥锁：同一时刻只有一个任务在执行，其余按调用顺序排队。
 *
 * 原理是把每个任务接在上一个任务的 Promise 后面，形成一条队列。
 */
export class Mutex {
  #tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(task);
    // 前一个任务失败不能卡住后面的任务，所以队尾吞掉错误；错误仍由 result 交给调用方
    this.#tail = result.catch(() => undefined);
    return result;
  }
}
