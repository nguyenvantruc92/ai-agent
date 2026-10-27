import { createHmac, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { env } from '@/lib/env';

const scrypt = promisify(scryptCallback);
const cookieName = 'fashion_admin_session';

export async function verifyPassword(password: string) {
  if (!env.ADMIN_PASSWORD_HASH) return false;
  const [salt, expectedHex] = env.ADMIN_PASSWORD_HASH.split(':');
  if (!salt || !expectedHex) return false;
  const actual = Buffer.from((await scrypt(password, salt, 64)) as ArrayBuffer);
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createPasswordHash(password: string) {
  const salt = randomUUID();
  return scrypt(password, salt, 64).then((value) => `${salt}:${Buffer.from(value as ArrayBuffer).toString('hex')}`);
}

function signature(payload: string) {
  if (!env.ADMIN_SESSION_SECRET) throw new Error('ADMIN_SESSION_SECRET is missing.');
  return createHmac('sha256', env.ADMIN_SESSION_SECRET).update(payload).digest('base64url');
}

export function createAdminSession() {
  const payload = JSON.stringify({ role: 'admin', exp: Date.now() + 1000 * 60 * 60 * 8 });
  return `${Buffer.from(payload).toString('base64url')}.${signature(payload)}`;
}

export function isAdminSession(value: string | undefined) {
  if (!value || !env.ADMIN_SESSION_SECRET) return false;
  const [encoded, received] = value.split('.');
  if (!encoded || !received) return false;
  let payload: string;
  try { payload = Buffer.from(encoded, 'base64url').toString('utf8'); } catch { return false; }
  const expected = signature(payload);
  if (expected.length !== received.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(received))) return false;
  try {
    const decoded = JSON.parse(payload) as { role?: string; exp?: number };
    return decoded.role === 'admin' && typeof decoded.exp === 'number' && decoded.exp > Date.now();
  } catch { return false; }
}

export const adminCookie = cookieName;
