import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { adminCookie, isAdminSession } from '@/features/auth/session';
import { env } from '@/lib/env';
import { formatWait } from '@/lib/format';
import { clientIp, takeRateLimit } from '@/lib/rate-limit';

/**
 * Every admin API route starts here. After the session check, a per-IP cap (ADMIN_API_RATE_LIMIT/minute) limits what a
 * stolen session or a runaway script can do; unauthenticated calls are refused before touching the rate-limit table.
 */
export async function requireAdmin() {
  const jar = await cookies();
  if (!isAdminSession(jar.get(adminCookie)?.value)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const limit = await takeRateLimit(`admin-api:${clientIp(await headers())}`, env.ADMIN_API_RATE_LIMIT, 60);
  if (!limit.allowed) return tooManyRequests({ error: 'Quá nhiều thao tác quản trị.' }, limit.retryAfterSeconds);
  return null;
}

export function jsonError(error: unknown, status = 400) {
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Đã có lỗi xảy ra.' }, { status });
}

/** An expected failure with the HTTP status the client should see (404 missing, 409 conflict, 429 with a wait…). */
export class HttpError extends Error {
  constructor(message: string, readonly status = 400, readonly retryAfterSeconds?: number) { super(message); }
}

/** 429 with the wait in the message, in `retryAfterSeconds` and in the Retry-After header (see `apiError`). */
export const rateLimitError = (message: string, retryAfterSeconds: number) =>
  new HttpError(`${message} Vui lòng thử lại sau ${formatWait(retryAfterSeconds)}.`, 429, retryAfterSeconds);

/** Same contract for routes that build their own response: JSON `retryAfterSeconds` + `Retry-After` header. */
export function tooManyRequests(body: Record<string, unknown> & { error: string }, retryAfterSeconds: number) {
  return NextResponse.json({ ...body, error: `${body.error} Vui lòng thử lại sau ${formatWait(retryAfterSeconds)}.`, retryAfterSeconds }, { status: 429, headers: { 'retry-after': String(retryAfterSeconds) } });
}

/**
 * Maps known failures to a response: validation (400, first issue), our own HttpError,
 * and Postgres unique/foreign-key violations (409). Anything else is logged-as-500 without leaking details.
 */
export function apiError(error: unknown) {
  if (error instanceof HttpError) {
    const wait = error.retryAfterSeconds;
    return wait === undefined
      ? NextResponse.json({ error: error.message }, { status: error.status })
      : NextResponse.json({ error: error.message, retryAfterSeconds: wait }, { status: error.status, headers: { 'retry-after': String(wait) } });
  }
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    const path = issue.path.length ? `${issue.path.join('.')}: ` : '';
    return NextResponse.json({ error: `${path}${issue.message}` }, { status: 400 });
  }
  const code = (error as { code?: string } | null)?.code;
  if (code === '23505') return NextResponse.json({ error: 'Giá trị này đã tồn tại (mã hoặc slug bị trùng).' }, { status: 409 });
  if (code === '23503') return NextResponse.json({ error: 'Dữ liệu đang được tham chiếu bởi bản ghi khác.' }, { status: 409 });
  if (error instanceof SyntaxError) return NextResponse.json({ error: 'JSON không hợp lệ.' }, { status: 400 });
  console.error(error);
  return NextResponse.json({ error: 'Đã có lỗi xảy ra.' }, { status: 500 });
}
