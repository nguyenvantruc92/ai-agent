import { randomUUID } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import type { NextResponse } from 'next/server';
import { sql } from '@/db/client';
import { getDefaultAgent } from '@/features/ai/agents';

const visitorCookie = 'fashion_visitor_id';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Anonymous visitor identity from an HttpOnly cookie; `persist` sets it on responses when new. */
export async function visitorSession() {
  const jar = await cookies();
  const secure = (await headers()).get('x-forwarded-proto') === 'https';
  const cookieValue = jar.get(visitorCookie)?.value;
  const existing = cookieValue && uuidPattern.test(cookieValue) ? cookieValue : undefined;
  const visitorId = existing ?? randomUUID();
  return {
    visitorId,
    isNew: !existing,
    persist<T extends NextResponse>(response: T) {
      if (!existing) response.cookies.set(visitorCookie, visitorId, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 60 * 60 * 24 * 30 });
      return response;
    },
  };
}

export async function ownedThread(threadId: string, visitorId: string) {
  if (!uuidPattern.test(threadId)) return undefined;
  const [thread] = await sql<{ id: string }[]>`SELECT id FROM chat_threads WHERE id = ${threadId} AND visitor_id = ${visitorId}`;
  return thread?.id;
}

/**
 * New threads belong to the default agent at the time they are created and keep it if the default changes later.
 * `testAgentId` (admin "Chat thử" only) starts the thread on that agent instead and marks it as a test thread.
 */
export async function getOrCreateThread(requestedId: string | undefined, visitorId: string, testAgentId?: string) {
  const owned = requestedId ? await ownedThread(requestedId, visitorId) : undefined;
  if (owned) return owned;
  const id = randomUUID();
  if (testAgentId) {
    const [agent] = await sql<{ id: string }[]>`SELECT id FROM ai_agents WHERE id = ${testAgentId} AND archived_at IS NULL`;
    if (!agent) throw new Error('Không tìm thấy Agent để chat thử.');
    await sql`INSERT INTO chat_threads (id, visitor_id, agent_id, is_test) VALUES (${id}, ${visitorId}, ${agent.id}, true)`;
    return id;
  }
  const agent = await getDefaultAgent();
  await sql`INSERT INTO chat_threads (id, visitor_id, agent_id) VALUES (${id}, ${visitorId}, ${agent.id})`;
  return id;
}
