/**
 * A deliberately small fixed-window limiter held in process memory.
 *
 * This exists to blunt password guessing and channel-spam from a single
 * source, not to be a distributed quota system. It matches the rest of the
 * app's storage model: one instance, nothing persisted.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

interface LimiterState {
  buckets: Map<string, Bucket>;
}

const GLOBAL_KEY = '__airwave_rate_limiter__';

function state(): LimiterState {
  const g = globalThis as unknown as Record<string, LimiterState | undefined>;
  let existing = g[GLOBAL_KEY];
  if (!existing) {
    existing = { buckets: new Map() };
    g[GLOBAL_KEY] = existing;
  }
  return existing;
}

export interface RateResult {
  ok: boolean;
  /** Seconds until the window resets. Suitable for a Retry-After header. */
  retryAfter: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateResult {
  const { buckets } = state();
  const now = Date.now();

  // Opportunistic cleanup. Cheap, and keeps the map from growing forever.
  if (buckets.size > 5_000) {
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  return { ok: true, retryAfter: 0 };
}

/**
 * Best-effort caller identity. Render terminates TLS at its proxy and
 * forwards the original address in x-forwarded-for.
 */
export function callerKey(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip') ?? 'unknown';
}
