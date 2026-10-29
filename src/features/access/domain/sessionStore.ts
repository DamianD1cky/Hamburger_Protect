/** An in-memory profile cache, never a source of authorization decisions. */
export function createSessionStore<T>(now = Date.now, maxAge = 30_000) {
  let version = 0;
  let cached: { key: string; value: T; until: number } | null = null;
  let pending: { key: string; promise: Promise<T> } | null = null;
  return {
    peek: () => cached?.value ?? null,
    clear() {
      version++;
      cached = null;
      pending = null;
    },
    async load(key: string, resolve: () => Promise<T>): Promise<T> {
      if (cached?.key === key && now() < cached.until) return cached.value;
      if (pending?.key === key) return pending.promise;
      const ticket = ++version;
      // A different identity must never inherit the previous profile.
      if (cached?.key !== key) cached = null;
      const promise = Promise.resolve()
        .then(resolve)
        .then((value) => {
          if (ticket !== version) throw new Error("SESSION_CHANGED");
          cached = { key, value, until: now() + maxAge };
          return value;
        });
      pending = { key, promise };
      try {
        return await promise;
      } catch (error) {
        if (ticket === version) cached = null;
        throw error;
      } finally {
        if (pending?.promise === promise) pending = null;
      }
    },
  };
}
