import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { adminCookie, isAdminSession } from '@/features/auth/session';

export async function requireAdmin() {
  const jar = await cookies();
  if (!isAdminSession(jar.get(adminCookie)?.value)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export function jsonError(error: unknown, status = 400) {
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Đã có lỗi xảy ra.' }, { status });
}

/** An expected failure with the HTTP status the client should see (404 missing, 409 conflict, ...). */
export class HttpError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

/**
 * Maps known failures to a response: validation (400, first issue), our own HttpError,
 * and Postgres unique/foreign-key violations (409). Anything else is logged-as-500 without leaking details.
 */
export function apiError(error: unknown) {
  if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
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
