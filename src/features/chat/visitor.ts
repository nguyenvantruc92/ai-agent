import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { sql } from '@/db/client';

const visitorCookie = 'fashion_visitor_id';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Anonymous visitor identity from an HttpOnly cookie; `persist` sets it on responses when new. */
export async function visitorSession() {
  const jar = await cookies();
  const cookieValue = jar.get(visitorCookie)?.value;
  const existing = cookieValue && uuidPattern.test(cookieValue) ? cookieValue : undefined;
  const visitorId = existing ?? randomUUID();
  return {
    visitorId,
    isNew: !existing,
    persist<T extends NextResponse>(response: T) {
      if (!existing) response.cookies.set(visitorCookie, visitorId, { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 60 * 60 * 24 * 30 });
      return response;
    },
  };
}

export async function ownedThread(threadId: string, visitorId: string) {
  if (!uuidPattern.test(threadId)) return undefined;
  const [thread] = await sql<{ id: string }[]>`SELECT id FROM chat_threads WHERE id = ${threadId} AND visitor_id = ${visitorId}`;
  return thread?.id;
}

export async function getOrCreateThread(requestedId: string | undefined, visitorId: string) {
  const owned = requestedId ? await ownedThread(requestedId, visitorId) : undefined;
  if (owned) return owned;
  const id = randomUUID();
  await sql`INSERT INTO chat_threads (id, visitor_id) VALUES (${id}, ${visitorId})`;
  return id;
}
