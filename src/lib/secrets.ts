import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * Encryption for secrets kept in the database (AES-256-GCM, random IV per value). The key is derived from
 * SETTINGS_ENCRYPTION_KEY, or from ADMIN_SESSION_SECRET when that is not set. Rotating the secret makes stored
 * values unreadable; the admin UI then asks for the value again.
 */
function encryptionKey() {
  const secret = env.SETTINGS_ENCRYPTION_KEY ?? env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error('Thiếu SETTINGS_ENCRYPTION_KEY hoặc ADMIN_SESSION_SECRET nên không thể mã hóa khóa bí mật.');
  return Buffer.from(hkdfSync('sha256', secret, 'fashion-tomodev', 'app-secrets-v1', 32));
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64')}`;
}

export function decryptSecret(stored: string) {
  if (!stored.startsWith('v1:')) throw new Error('Định dạng khóa bí mật không hỗ trợ.');
  const raw = Buffer.from(stored.slice(3), 'base64');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}
