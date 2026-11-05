import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '@/lib/env';
import { formatWait } from '@/lib/format';
import { apiError, HttpError, rateLimitError, requireAdmin, tooManyRequests } from '@/lib/http';
import { bucketKey } from '@/lib/rate-limit';
import { retryAfterOf } from '@/lib/shop-client';
import { acceptedMcpTokens, hasInternalMcpAccess, internalMcpTokenSource } from '@/mcp/internal-auth';

// requireAdmin reads the session cookie and client IP through next/headers; the session itself is not under test.
const requestHeaders = vi.hoisted(() => ({ ip: '203.0.113.7' }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: 'session' }) }),
  headers: async () => new Headers({ 'cf-connecting-ip': requestHeaders.ip }),
}));
vi.mock('@/features/auth/session', () => ({ adminCookie: 'admin', isAdminSession: () => true }));

const saved = { ...env };
afterEach(() => { Object.assign(env, saved); });

describe('429 responses', () => {
  it('formats waits for people', () => {
    expect([formatWait(1), formatWait(45), formatWait(60), formatWait(61), formatWait(600)]).toEqual(['1 giây', '45 giây', '1 phút', '2 phút', '10 phút']);
  });

  it('carries the wait in the message, the JSON body and the Retry-After header', async () => {
    const response = apiError(rateLimitError('Bạn thao tác quá nhanh.', 42));
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('42');
    expect(await response.json()).toEqual({ error: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau 42 giây.', retryAfterSeconds: 42 });
  });

  it('keeps other HttpErrors unchanged', async () => {
    const response = apiError(new HttpError('Không tìm thấy.', 404));
    expect(response.headers.get('retry-after')).toBeNull();
    expect(await response.json()).toEqual({ error: 'Không tìm thấy.' });
  });

  it('builds the same contract for routes with their own body', async () => {
    const response = tooManyRequests({ error: 'Bạn đã gửi quá nhiều tin nhắn.', traceId: 't-1' }, 125);
    expect(response.headers.get('retry-after')).toBe('125');
    expect(await response.json()).toEqual({ error: 'Bạn đã gửi quá nhiều tin nhắn. Vui lòng thử lại sau 3 phút.', traceId: 't-1', retryAfterSeconds: 125 });
  });

  it('lets the browser read the wait from the body or the header, only on 429', () => {
    expect(retryAfterOf(new Response(null, { status: 429 }), { retryAfterSeconds: 30 })).toBe(30);
    expect(retryAfterOf(new Response(null, { status: 429, headers: { 'retry-after': '12' } }), {})).toBe(12);
    expect(retryAfterOf(new Response(null, { status: 429 }), {})).toBeUndefined();
    expect(retryAfterOf(new Response(null, { status: 400, headers: { 'retry-after': '12' } }), {})).toBeUndefined();
  });
});

describe('admin API rate limit', () => {
  it('lets an authenticated admin through until the per-IP cap, then answers 429 with a wait', async () => {
    env.ADMIN_API_RATE_LIMIT = 3;
    requestHeaders.ip = '203.0.113.99';
    for (let call = 0; call < 3; call += 1) expect(await requireAdmin()).toBeNull();
    const blocked = await requireAdmin();
    expect(blocked?.status).toBe(429);
    expect(Number(blocked?.headers.get('retry-after'))).toBeGreaterThan(0);
    requestHeaders.ip = '203.0.113.100';
    expect(await requireAdmin()).toBeNull();
  });
});

describe('rate-limit bucket key', () => {
  it('refuses a public fallback key with the shared Postgres store', () => {
    Object.assign(env, { RATE_LIMIT_BACKEND: 'postgres', RATE_LIMIT_SECRET: undefined, ADMIN_SESSION_SECRET: undefined });
    expect(() => bucketKey('chat:visitor:ip')).toThrow(/RATE_LIMIT_SECRET or ADMIN_SESSION_SECRET/);
    env.RATE_LIMIT_SECRET = 'a-rate-limit-secret-of-24-chars-or-more';
    expect(bucketKey('chat:visitor:ip')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('allows the local key with the in-memory store (tests, single process)', () => {
    Object.assign(env, { RATE_LIMIT_BACKEND: 'memory', RATE_LIMIT_SECRET: undefined, ADMIN_SESSION_SECRET: undefined });
    expect(bucketKey('x')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('internal MCP token rotation', () => {
  const current = 'current-internal-token-with-24-chars';
  const previous = 'previous-internal-token-with-24-chars';

  it('accepts the previous token only while it is configured', () => {
    Object.assign(env, { INTERNAL_MCP_TOKEN: current, INTERNAL_MCP_TOKEN_PREVIOUS: previous });
    const rotating = acceptedMcpTokens();
    expect(hasInternalMcpAccess(`Bearer ${current}`, rotating)).toBe(true);
    expect(hasInternalMcpAccess(`Bearer ${previous}`, rotating)).toBe(true);
    expect(hasInternalMcpAccess('Bearer another-token-with-enough-chars', rotating)).toBe(false);

    env.INTERNAL_MCP_TOKEN_PREVIOUS = undefined;
    expect(hasInternalMcpAccess(`Bearer ${previous}`, acceptedMcpTokens())).toBe(false);
  });

  it('reports where the token comes from without exposing it', () => {
    Object.assign(env, { INTERNAL_MCP_TOKEN: current });
    expect(internalMcpTokenSource()).toBe('dedicated');
    Object.assign(env, { INTERNAL_MCP_TOKEN: undefined, ADMIN_SESSION_SECRET: 'admin-session-secret-with-24-chars' });
    expect(internalMcpTokenSource()).toBe('derived');
    Object.assign(env, { ADMIN_SESSION_SECRET: undefined });
    expect(internalMcpTokenSource()).toBe('missing');
    expect(acceptedMcpTokens()).toEqual([]);
  });
});
