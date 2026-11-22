/**
 * Fixed-window rate limiter, in memory.
 *
 * Good enough for a public demo on one instance; serverless instances do not share it, so the
 * real ceiling is limit × instances. A shared store (KV/Redis) is the upgrade path.
 */

export type RateLimitDecision =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSec: number };

export type RateLimiter = {
  take(key: string): RateLimitDecision;
};

type Window = { start: number; count: number };

export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
  now?: () => number;
}): RateLimiter {
  const { limit, windowMs } = options;
  const now = options.now ?? Date.now;
  const windows = new Map<string, Window>();

  function prune(at: number) {
    // Keep memory bounded when many IPs pass through.
    if (windows.size < 10_000) return;
    for (const [key, window] of windows) {
      if (at - window.start >= windowMs) windows.delete(key);
    }
  }

  return {
    take(key) {
      const at = now();
      prune(at);
      let window = windows.get(key);
      if (!window || at - window.start >= windowMs) {
        window = { start: at, count: 0 };
        windows.set(key, window);
      }
      if (window.count >= limit) {
        const retryAfterSec = Math.max(1, Math.ceil((window.start + windowMs - at) / 1000));
        return { allowed: false, retryAfterSec };
      }
      window.count += 1;
      return { allowed: true, remaining: limit - window.count };
    },
  };
}
