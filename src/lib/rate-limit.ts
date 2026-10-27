type Counter = { count: number; resetAt: number };
const counters = new Map<string, Counter>();

function active(key: string, now: number) {
  const current = counters.get(key);
  return current && current.resetAt > now ? current : undefined;
}

/** In-memory limiter is intentionally sufficient for the single-web-container exercise setup. */
export function takeRateLimit(key: string, limit: number, windowSeconds: number) {
  const now = Date.now();
  const current = active(key, now);
  if (!current) {
    counters.set(key, { count: 1, resetAt: now + windowSeconds * 1_000 });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (current.count >= limit) return { allowed: false, retryAfterSeconds: Math.ceil((current.resetAt - now) / 1_000) };
  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Checks a limit without consuming it, e.g. for counting only failed logins. */
export function peekRateLimit(key: string, limit: number) {
  const now = Date.now();
  const current = active(key, now);
  if (!current || current.count < limit) return { allowed: true, retryAfterSeconds: 0 };
  return { allowed: false, retryAfterSeconds: Math.ceil((current.resetAt - now) / 1_000) };
}

export function resetRateLimit(key: string) {
  counters.delete(key);
}

export function clientIp(request: Request) {
  return request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
}
