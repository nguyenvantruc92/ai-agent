import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * A dedicated token is preferred. The derived fallback keeps existing deployments that already
 * protect admin sessions working during rollout, without ever sending the session secret itself.
 */
export function internalMcpToken() {
  if (env.INTERNAL_MCP_TOKEN) return env.INTERNAL_MCP_TOKEN;
  return env.ADMIN_SESSION_SECRET
    ? createHmac('sha256', env.ADMIN_SESSION_SECRET).update('fashion-tomodev/internal-mcp/v1').digest('base64url')
    : undefined;
}

/** Where the token comes from: `derived` still works but should be replaced by a dedicated INTERNAL_MCP_TOKEN. */
export const internalMcpTokenSource = (): 'dedicated' | 'derived' | 'missing' =>
  env.INTERNAL_MCP_TOKEN ? 'dedicated' : env.ADMIN_SESSION_SECRET ? 'derived' : 'missing';

/**
 * Tokens the MCP server accepts. During a rotation INTERNAL_MCP_TOKEN_PREVIOUS is accepted too, so web/worker can be
 * restarted with the new token one by one; remove it once every client runs with the new one. Clients only ever send
 * `internalMcpToken()`.
 */
export const acceptedMcpTokens = () => [internalMcpToken(), env.INTERNAL_MCP_TOKEN_PREVIOUS].filter((token): token is string => Boolean(token));

/** Constant-time comparison for the private Compose-only MCP bearer credential (any accepted token). */
export const hasInternalMcpAccess = (header: string | undefined, accepted: string | string[] | undefined) =>
  (Array.isArray(accepted) ? accepted : [accepted]).some((token) => bearerMatches(header, token));

/** `Authorization: Bearer <token>` check in constant time; false when no token is configured. */
export function bearerMatches(header: string | undefined | null, expectedToken: string | undefined) {
  if (!expectedToken || !header?.startsWith('Bearer ')) return false;
  const received = Buffer.from(header.slice('Bearer '.length));
  const expected = Buffer.from(expectedToken);
  return received.length === expected.length && timingSafeEqual(received, expected);
}
