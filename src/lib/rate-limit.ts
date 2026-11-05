import { createHmac } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { sql } from '@/db/client';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { metrics, safely } from '@/lib/metrics';

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };
type Counter = { count: number; resetAt: number };
type Bucket = { count: number; expires_at: Date };

export interface RateLimitStore {
  take(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
  peek(key: string, limit: number): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
}

const retryAfter = (expiresAt: Date | number) => Math.max(1, Math.ceil(((expiresAt instanceof Date ? expiresAt.getTime() : expiresAt) - Date.now()) / 1_000));

/** Isolated-test/local implementation. Production Compose uses the Postgres implementation below. */
export function createMemoryRateLimitStore(): RateLimitStore {
  const counters = new Map<string, Counter>();
  const active = (key: string, now: number) => {
    const current = counters.get(key);
    return current && current.resetAt > now ? current : undefined;
  };
  return {
    async take(key, limit, windowSeconds) {
      const now = Date.now();
      const current = active(key, now);
      if (!current) {
        counters.set(key, { count: 1, resetAt: now + windowSeconds * 1_000 });
        return { allowed: true, retryAfterSeconds: 0 };
      }
      if (current.count >= limit) return { allowed: false, retryAfterSeconds: retryAfter(current.resetAt) };
      current.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    },
    async peek(key, limit) {
      const current = active(key, Date.now());
      return !current || current.count < limit
        ? { allowed: true, retryAfterSeconds: 0 }
        : { allowed: false, retryAfterSeconds: retryAfter(current.resetAt) };
    },
    async reset(key) { counters.delete(key); },
  };
}

/**
 * A DB row never contains the raw visitor, phone or IP embedded in a caller's key. With the shared Postgres store the
 * HMAC key must be secret (a public constant would let anyone map a phone/IP to its row), so it fails closed.
 */
function bucketSecret() {
  const secret = env.RATE_LIMIT_SECRET ?? env.ADMIN_SESSION_SECRET;
  if (secret) return secret;
  if (env.RATE_LIMIT_BACKEND === 'postgres') throw new Error('RATE_LIMIT_SECRET or ADMIN_SESSION_SECRET is required when RATE_LIMIT_BACKEND=postgres.');
  return 'fashion-rate-limit-local-key';
}
export const bucketKey = (key: string) => createHmac('sha256', bucketSecret()).update(key).digest('hex');

class PostgresRateLimitStore implements RateLimitStore {
  async take(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const hash = bucketKey(key);
    return sql.begin(async (tx) => this.takeInTransaction(tx, hash, limit, windowSeconds));
  }

  private async takeInTransaction(tx: TransactionSql, hash: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const expiry = new Date(Date.now() + windowSeconds * 1_000);
    const inserted = await tx<Bucket[]>`
      INSERT INTO rate_limit_buckets (key_hash, count, expires_at)
      VALUES (${hash}, 1, ${expiry})
      ON CONFLICT (key_hash) DO NOTHING
      RETURNING count, expires_at
    `;
    if (inserted[0]) return { allowed: true, retryAfterSeconds: 0 };
    const [current] = await tx<Bucket[]>`SELECT count, expires_at FROM rate_limit_buckets WHERE key_hash = ${hash} FOR UPDATE`;
    // A concurrent cleanup may remove an expired bucket between statements.
    if (!current || current.expires_at.getTime() <= Date.now()) {
      await tx`DELETE FROM rate_limit_buckets WHERE key_hash = ${hash}`;
      await tx`INSERT INTO rate_limit_buckets (key_hash, count, expires_at) VALUES (${hash}, 1, ${expiry})`;
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (current.count >= limit) return { allowed: false, retryAfterSeconds: retryAfter(current.expires_at) };
    await tx`UPDATE rate_limit_buckets SET count = count + 1, updated_at = now() WHERE key_hash = ${hash}`;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  async peek(key: string, limit: number): Promise<RateLimitResult> {
    const [current] = await sql<Bucket[]>`SELECT count, expires_at FROM rate_limit_buckets WHERE key_hash = ${bucketKey(key)}`;
    if (!current || current.expires_at.getTime() <= Date.now() || current.count < limit) return { allowed: true, retryAfterSeconds: 0 };
    return { allowed: false, retryAfterSeconds: retryAfter(current.expires_at) };
  }

  async reset(key: string) { await sql`DELETE FROM rate_limit_buckets WHERE key_hash = ${bucketKey(key)}`; }
}

const store: RateLimitStore = env.RATE_LIMIT_BACKEND === 'postgres' ? new PostgresRateLimitStore() : createMemoryRateLimitStore();

export async function takeRateLimit(key: string, limit: number, windowSeconds: number) {
  const result = await store.take(key, limit, windowSeconds);
  // Aggregate-safe telemetry: action only, never a key/IP/visitor identifier.
  const action = key.split(':', 1)[0];
  const outcome = result.allowed ? 'allowed' : 'rejected';
  logger.info({ stage: 'rate_limit', action, outcome });
  safely(() => metrics.rateLimit.inc({ action, outcome }));
  return result;
}
export const peekRateLimit = (key: string, limit: number) => store.peek(key, limit);
export const resetRateLimit = (key: string) => store.reset(key);
export async function cleanupRateLimitBuckets() {
  if (env.RATE_LIMIT_BACKEND === 'postgres') await sql`DELETE FROM rate_limit_buckets WHERE expires_at <= now()`;
}

export function clientIp(source: Request | Headers) {
  const headers = source instanceof Headers ? source : source.headers;
  return headers.get('cf-connecting-ip') ?? headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
}
