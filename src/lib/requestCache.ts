/**
 * A tiny keyed request cache with in-flight deduplication, used to stop hooks
 * from refetching the same list on every mount and from firing duplicate
 * parallel requests when several components mount in the same tick.
 *
 * Two modes, chosen per consumer via `ttlMs`:
 *
 * - `ttlMs > 0` — result cache + dedup. A resolved value is kept until it
 *   expires; a hook seeds its initial state from `peek(key)` (no loading
 *   flash) and skips the network while the entry is fresh. Suitable for lists
 *   whose mutations live in the same hook, so the hook can keep the cache in
 *   sync via `set(key, next)`.
 *
 * - `ttlMs === 0` (default) — dedup only, no persisted result. Concurrent
 *   callers for the same key share one in-flight promise, but once it settles
 *   the next call fetches fresh. Suitable when writes are scattered across the
 *   app and a stale cache would be hard to invalidate reliably
 *   (e.g. the evaluator library).
 *
 * The cache is module-scoped by whoever creates it, and keyed by an opaque
 * string the caller composes (typically `${accessToken}:${...}`), so entries
 * are naturally partitioned per user/token.
 */

type CacheEntry<T> = { value: T; expiresAt: number };

export type RequestCache<T> = {
  /** Return a fresh cached value, or undefined if absent/expired. */
  peek: (key: string) => T | undefined;
  /**
   * Fetch through the cache: concurrent calls for the same key share one
   * promise. On success the value is stored when `ttlMs > 0`.
   */
  fetch: (key: string, fetcher: () => Promise<T>) => Promise<T>;
  /** Overwrite a cached value (no-op when `ttlMs === 0`). */
  set: (key: string, value: T) => void;
  /** Drop a cached value and any in-flight promise for the key. */
  invalidate: (key: string) => void;
  /** Drop everything (e.g. on sign-out). */
  clear: () => void;
};

// Every cache registers its `clear` here so tests can wipe all module-level
// caches between cases. Not wired into sign-out: caches are keyed by access
// token, so a different user never reads another user's entries, and stale
// entries expire on their own TTL.
const registeredClears = new Set<() => void>();

/** Clear every cache created via `createRequestCache`. Intended for tests. */
export function clearAllRequestCaches(): void {
  for (const clear of registeredClears) clear();
}

export function createRequestCache<T>(options?: {
  ttlMs?: number;
}): RequestCache<T> {
  const ttlMs = options?.ttlMs ?? 0;
  const cache = new Map<string, CacheEntry<T>>();
  const inflight = new Map<string, Promise<T>>();

  const peek = (key: string): T | undefined => {
    const entry = cache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      cache.delete(key);
      return undefined;
    }
    return entry.value;
  };

  const store = (key: string, value: T) => {
    if (ttlMs > 0) cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  };

  const fetch = (key: string, fetcher: () => Promise<T>): Promise<T> => {
    const existing = inflight.get(key);
    if (existing) return existing;
    const promise = (async () => {
      try {
        const value = await fetcher();
        store(key, value);
        return value;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, promise);
    return promise;
  };

  const clear = () => {
    cache.clear();
    inflight.clear();
  };
  registeredClears.add(clear);

  return {
    peek,
    fetch,
    set: store,
    invalidate: (key: string) => {
      cache.delete(key);
      inflight.delete(key);
    },
    clear,
  };
}
