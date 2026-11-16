import type { Action } from './definition';

export class ActionRegistry {
  readonly #actions = new Map<string, Action>();

  register(action: Action): this {
    if (this.#actions.has(action.key))
      throw new Error(`能力 ${action.key} 已注册`);
    this.#actions.set(action.key, action);
    return this;
  }

  get(key: string): Action {
    const action = this.#actions.get(key);
    if (!action) throw new Error(`能力 ${key} 未注册`);
    return action;
  }
}
