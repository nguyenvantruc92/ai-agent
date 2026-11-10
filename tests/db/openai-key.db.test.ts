import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** Needs TEST_DATABASE_URL (see catalog-admin.db.test.ts); skipped otherwise. */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('OpenAI key stored in admin settings (Postgres)', () => {
  let sql: typeof import('@/db/client').sql;
  let keys: typeof import('@/features/settings/openai-key');
  const FIRST = 'sk-proj-first_1234567890abcdefWXYZ';
  const SECOND = 'sk-proj-second_1234567890abcdefQRST';

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.ADMIN_SESSION_SECRET = 'a-long-enough-session-secret-for-tests';
    ({ sql } = await import('@/db/client'));
    await (await import('@/db/apply-migrations')).applyMigrations();
    keys = await import('@/features/settings/openai-key');
  });
  afterAll(async () => { await sql?.end(); });
  beforeEach(async () => { await sql`DELETE FROM app_secrets`; keys.clearOpenAiKeyCache(); });

  it('starts with no key from the database, and takes the saved one first', async () => {
    expect((await keys.openAiKeyStatus()).source).toBe((await keys.getOpenAiKey()) ? 'env' : 'none');
    await keys.saveOpenAiKey(FIRST);
    expect(await keys.getOpenAiKey()).toBe(FIRST);
    expect(await keys.openAiKeyStatus()).toMatchObject({ source: 'admin', hint: 'WXYZ', unreadable: false });
  });

  it('stores it encrypted, never in clear text', async () => {
    await keys.saveOpenAiKey(FIRST);
    const [row] = await sql<{ value_encrypted: string; hint: string }[]>`SELECT value_encrypted, hint FROM app_secrets`;
    expect(row.value_encrypted).not.toContain('first_1234567890');
    expect(row.value_encrypted.startsWith('v1:')).toBe(true);
    expect(row.hint).toBe('WXYZ');
  });

  it('replaces the key and applies the change immediately in this process', async () => {
    await keys.saveOpenAiKey(FIRST);
    expect(await keys.getOpenAiKey()).toBe(FIRST);
    await keys.saveOpenAiKey(SECOND);
    expect(await keys.getOpenAiKey()).toBe(SECOND);
    expect((await keys.openAiKeyStatus()).hint).toBe('QRST');
    expect(await sql`SELECT 1 FROM app_secrets`).toHaveLength(1);
  });

  it('falls back to the .env key (or none) after the saved key is deleted', async () => {
    await keys.saveOpenAiKey(FIRST);
    await keys.deleteOpenAiKey();
    expect(await keys.getOpenAiKey()).not.toBe(FIRST);
    expect((await keys.openAiKeyStatus()).source).not.toBe('admin');
  });

  it('reports a stored key it can no longer decrypt, and does not use it', async () => {
    await sql`INSERT INTO app_secrets (name, value_encrypted, hint) VALUES ('openai_api_key', 'v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'xxxx')`;
    expect(await keys.openAiKeyStatus()).toMatchObject({ unreadable: true });
    expect(await keys.getOpenAiKey()).not.toBe(FIRST);
  });

  it('validates the key format', () => {
    expect(keys.openAiKeyInput.safeParse(FIRST).success).toBe(true);
    expect(keys.openAiKeyInput.safeParse('not-a-key').success).toBe(false);
    expect(keys.openAiKeyInput.safeParse('sk-has space inside-xxxxxxxxxx').success).toBe(false);
  });
});
