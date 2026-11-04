import { NextResponse } from 'next/server';
import { discoverInput, discoverTools } from '@/features/mcp/servers';
import { apiError, HttpError, requireAdmin } from '@/lib/http';
import { clientIp, takeRateLimit } from '@/lib/rate-limit';

/**
 * "Lấy danh sách tool": connects with the settings typed in the form (nothing is saved) and returns the server's tools so the
 * admin can tick the ones to use. Rate limited with the connection test: each call makes an outbound request.
 */
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const input = discoverInput.parse(await request.json());
    const limit = takeRateLimit(`mcp-test:${clientIp(request)}`, 30, 600);
    if (!limit.allowed) throw new HttpError(`Thao tác quá nhiều lần. Thử lại sau ${limit.retryAfterSeconds} giây.`, 429);
    return NextResponse.json(await discoverTools(input));
  } catch (error) { return apiError(error); }
}
