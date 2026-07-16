import {
  createRequestCache,
  clearAllRequestCaches,
} from "../requestCache";

describe("createRequestCache", () => {
  describe("in-flight dedup (ttlMs = 0)", () => {
    it("shares one promise for concurrent calls with the same key", async () => {
      const cache = createRequestCache<number>();
      const fetcher = jest.fn().mockResolvedValue(42);

      const [a, b] = await Promise.all([
        cache.fetch("k", fetcher),
        cache.fetch("k", fetcher),
      ]);

      expect(a).toBe(42);
      expect(b).toBe(42);
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("fetches again once the in-flight promise settles", async () => {
      const cache = createRequestCache<number>();
      const fetcher = jest.fn().mockResolvedValue(1);

      await cache.fetch("k", fetcher);
      await cache.fetch("k", fetcher);

      expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it("does not persist a value: peek stays empty", async () => {
      const cache = createRequestCache<number>();
      await cache.fetch("k", () => Promise.resolve(7));
      expect(cache.peek("k")).toBeUndefined();
    });

    it("keys are independent", async () => {
      const cache = createRequestCache<string>();
      const fetcher = jest.fn(
        (v: string) => () => Promise.resolve(v),
      );

      const [a, b] = await Promise.all([
        cache.fetch("a", fetcher("A")),
        cache.fetch("b", fetcher("B")),
      ]);

      expect(a).toBe("A");
      expect(b).toBe("B");
    });

    it("clears the in-flight entry even when the fetcher rejects", async () => {
      const cache = createRequestCache<number>();
      const boom = jest.fn().mockRejectedValue(new Error("boom"));

      await expect(cache.fetch("k", boom)).rejects.toThrow("boom");
      // A subsequent call is not blocked by a stuck in-flight promise.
      const ok = jest.fn().mockResolvedValue(5);
      await expect(cache.fetch("k", ok)).resolves.toBe(5);
    });
  });

  describe("result cache (ttlMs > 0)", () => {
    it("peek returns a stored value within the TTL", async () => {
      const cache = createRequestCache<number>({ ttlMs: 10_000 });
      await cache.fetch("k", () => Promise.resolve(99));
      expect(cache.peek("k")).toBe(99);
    });

    it("expires a value after the TTL", async () => {
      jest.useFakeTimers();
      try {
        const cache = createRequestCache<number>({ ttlMs: 1_000 });
        await cache.fetch("k", () => Promise.resolve(99));
        expect(cache.peek("k")).toBe(99);

        jest.advanceTimersByTime(1_001);
        expect(cache.peek("k")).toBeUndefined();
      } finally {
        jest.useRealTimers();
      }
    });

    it("set overwrites the cached value", () => {
      const cache = createRequestCache<number>({ ttlMs: 10_000 });
      cache.set("k", 3);
      expect(cache.peek("k")).toBe(3);
      cache.set("k", 4);
      expect(cache.peek("k")).toBe(4);
    });

    it("invalidate drops a cached value", async () => {
      const cache = createRequestCache<number>({ ttlMs: 10_000 });
      await cache.fetch("k", () => Promise.resolve(1));
      cache.invalidate("k");
      expect(cache.peek("k")).toBeUndefined();
    });

    it("clear drops everything", async () => {
      const cache = createRequestCache<number>({ ttlMs: 10_000 });
      await cache.fetch("a", () => Promise.resolve(1));
      await cache.fetch("b", () => Promise.resolve(2));
      cache.clear();
      expect(cache.peek("a")).toBeUndefined();
      expect(cache.peek("b")).toBeUndefined();
    });
  });

  describe("set is a no-op when ttlMs = 0", () => {
    it("does not persist via set", () => {
      const cache = createRequestCache<number>();
      cache.set("k", 1);
      expect(cache.peek("k")).toBeUndefined();
    });
  });

  describe("clearAllRequestCaches", () => {
    it("wipes every registered cache", async () => {
      const a = createRequestCache<number>({ ttlMs: 10_000 });
      const b = createRequestCache<number>({ ttlMs: 10_000 });
      await a.fetch("x", () => Promise.resolve(1));
      await b.fetch("y", () => Promise.resolve(2));

      clearAllRequestCaches();

      expect(a.peek("x")).toBeUndefined();
      expect(b.peek("y")).toBeUndefined();
    });
  });
});
