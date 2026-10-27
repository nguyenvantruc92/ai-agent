import { NextResponse } from 'next/server';
import { adminCookie, createAdminSession, verifyPassword } from '@/features/auth/session';
import { jsonError } from '@/lib/http';
import { clientIp, peekRateLimit, resetRateLimit, takeRateLimit } from '@/lib/rate-limit';

const MAX_FAILED_LOGINS = 5;
const FAILED_LOGIN_WINDOW_SECONDS = 15 * 60;

export async function POST(request: Request) {
  const key = `admin-login:${clientIp(request)}`;
  const blocked = peekRateLimit(key, MAX_FAILED_LOGINS);
  if (!blocked.allowed) return NextResponse.json({ error: 'Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau.', retryAfterSeconds: blocked.retryAfterSeconds }, { status: 429 });
  try {
    const { password } = await request.json() as { password?: string };
    if (!password || !(await verifyPassword(password))) {
      takeRateLimit(key, MAX_FAILED_LOGINS, FAILED_LOGIN_WINDOW_SECONDS);
      return jsonError(new Error('Mật khẩu không đúng.'), 401);
    }
    resetRateLimit(key);
    const response = NextResponse.json({ ok: true });
    // Browsers accept Secure cookies on http://localhost, and the tunnel serves HTTPS.
    response.cookies.set(adminCookie, createAdminSession(), { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 60 * 60 * 8 });
    return response;
  } catch (error) { return jsonError(error); }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminCookie, '', { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 0 });
  return response;
}
