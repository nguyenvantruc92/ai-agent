import { NextResponse } from 'next/server';
import { visitorSession } from '@/features/chat/visitor';
import { HttpError } from '@/lib/http';
import { clientIp, takeRateLimit } from '@/lib/rate-limit';

type Session = Awaited<ReturnType<typeof visitorSession>>;

/**
 * Shared checks for the customer-facing write endpoints: JSON bodies only (a cross-site <form> cannot send
 * them), plus a per-IP write limit. Reads and DELETEs skip the content-type check.
 */
export function guardWrite(request: Request, scope: string, limit = 60, windowSeconds = 60) {
  if (['POST', 'PATCH', 'PUT'].includes(request.method) && !(request.headers.get('content-type') ?? '').includes('application/json')) {
    throw new HttpError('Yêu cầu không hợp lệ.', 415);
  }
  const taken = takeRateLimit(`shop:${scope}:${clientIp(request)}`, limit, windowSeconds);
  if (!taken.allowed) throw new HttpError('Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.', 429);
}

/** JSON response that also sets the visitor cookie when this browser did not have one yet. */
export const withVisitor = (session: Session, body: unknown, init?: ResponseInit) => session.persist(NextResponse.json(body, init));

/** A body that may be empty (cancel/pay accept `{}` or nothing). */
export async function readOptionalJson(request: Request): Promise<unknown> {
  const text = await request.text();
  return text ? JSON.parse(text) : {};
}
