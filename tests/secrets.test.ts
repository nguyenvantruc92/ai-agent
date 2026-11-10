import { afterEach, describe, expect, it, vi } from 'vitest';

async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value as string);
  return import('@/lib/secrets');
}
afterEach(() => vi.unstubAllEnvs());

describe('secrets', () => {
  const secret = 'a-long-enough-session-secret-for-tests';

  it('round-trips a value and never stores it in clear text', async () => {
    const { encryptSecret, decryptSecret } = await load({ ADMIN_SESSION_SECRET: secret });
    const stored = encryptSecret('sk-test-1234567890abcdef');
    expect(stored.startsWith('v1:')).toBe(true);
    expect(stored).not.toContain('sk-test');
    expect(decryptSecret(stored)).toBe('sk-test-1234567890abcdef');
  });

  it('uses a fresh IV each time', async () => {
    const { encryptSecret } = await load({ ADMIN_SESSION_SECRET: secret });
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });

  it('cannot be read with a different secret, and detects tampering', async () => {
    const first = await load({ ADMIN_SESSION_SECRET: secret });
    const stored = first.encryptSecret('sk-test-1234567890abcdef');
    const other = await load({ ADMIN_SESSION_SECRET: 'another-long-enough-session-secret!!' });
    expect(() => other.decryptSecret(stored)).toThrow();
    const again = await load({ ADMIN_SESSION_SECRET: secret });
    const bytes = Buffer.from(stored.slice(3), 'base64');
    bytes[bytes.length - 1] ^= 1;
    expect(() => again.decryptSecret(`v1:${bytes.toString('base64')}`)).toThrow();
  });

  it('prefers SETTINGS_ENCRYPTION_KEY over the session secret', async () => {
    const withKey = await load({ ADMIN_SESSION_SECRET: secret, SETTINGS_ENCRYPTION_KEY: 'dedicated-encryption-key-123' });
    const stored = withKey.encryptSecret('sk-test-1234567890abcdef');
    const sessionOnly = await load({ ADMIN_SESSION_SECRET: secret, SETTINGS_ENCRYPTION_KEY: undefined });
    expect(() => sessionOnly.decryptSecret(stored)).toThrow();
  });
});
