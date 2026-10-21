// 很小的狀態容器：set 之後通知所有訂閱者（新舊狀態都給，讓訂閱者自己判斷要不要重畫）。

export type Store<T> = {
  get(): T;
  set(patch: Partial<T> | ((s: T) => Partial<T>)): void;
  subscribe(fn: (s: T, prev: T) => void): () => void;
};

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const subs = new Set<(s: T, prev: T) => void>();
  return {
    get: () => state,
    set(patch) {
      const prev = state;
      state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
      for (const fn of subs) fn(state, prev);
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}
