import { NextResponse } from 'next/server';
import { z } from 'zod';
import { testServer } from '@/features/mcp/servers';
import { apiError, HttpError, requireAdmin } from '@/lib/http';
import { clientIp, takeRateLimit } from '@/lib/rate-limit';

type Context = { params: Promise<{ id: string }> };

/** Connects to the server, lists its tools and stores the result. Rate limited: each call makes an outbound request. */
export async function POST(request: Request, { params }: Context) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const id = z.string().uuid('ID không hợp lệ.').parse((await params).id);
    const limit = takeRateLimit(`mcp-test:${clientIp(request)}`, 30, 600);
    if (!limit.allowed) throw new HttpError(`Kiểm tra quá nhiều lần. Thử lại sau ${limit.retryAfterSeconds} giây.`, 429);
    return NextResponse.json(await testServer(id));
  } catch (error) { return apiError(error); }
}
