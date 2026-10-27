import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
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
