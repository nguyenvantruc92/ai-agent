import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** Needs TEST_DATABASE_URL (see catalog-admin.db.test.ts); skipped otherwise. */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('worker alerts (Postgres)', () => {
  let sql: typeof import('@/db/client').sql;
  let alerts: typeof import('@/features/monitoring/alerts');
  let env: typeof import('@/lib/env').env;
  let server: Server;
  const received: { text: string; content: string }[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ sql } = await import('@/db/client'));
    await (await import('@/db/apply-migrations')).applyMigrations();
    ({ env } = await import('@/lib/env'));
    alerts = await import('@/features/monitoring/alerts');
    // A local webhook receiver, and an MCP URL nothing listens on, so `mcp_builtin_down` fires.
    server = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => { received.push(JSON.parse(body)); response.writeHead(204).end(); });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    env.ALERT_WEBHOOK_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
    env.MCP_URL = 'http://127.0.0.1:9/mcp';
  });

  beforeEach(async () => {
    received.length = 0;
    await sql`DELETE FROM alert_events`;
    await sql`DELETE FROM approval_requests`;
  });

  afterAll(async () => {
    server?.close();
    await sql?.end();
  });

  it('fires once, notifies the webhook with numbers only, and de-duplicates the next check', async () => {
    expect(await alerts.runAlertChecks()).toBe(1);
    const [event] = await alerts.recentAlerts();
    expect(event).toMatchObject({ alert_key: 'mcp_builtin_down', severity: 'critical', notified: true });
    expect(received).toHaveLength(1);
    expect(received[0].text).toContain('MCP nội bộ không phản hồi');
    expect(received[0].content).toBe(received[0].text);

    expect(await alerts.runAlertChecks()).toBe(0);
    expect(received).toHaveLength(1);
    expect(await sql`SELECT 1 FROM alert_events`).toHaveLength(1);
  });

  it('fires again once the de-duplication window has passed', async () => {
    await alerts.runAlertChecks();
    await sql`UPDATE alert_events SET fired_at = now() - interval '2 hours'`;
    expect(await alerts.runAlertChecks()).toBe(1);
    expect(received).toHaveLength(2);
  });

  it('records the alert even when the webhook is unreachable', async () => {
    const hook = env.ALERT_WEBHOOK_URL;
    env.ALERT_WEBHOOK_URL = 'http://127.0.0.1:9/hook';
    try {
      expect(await alerts.runAlertChecks()).toBe(1);
      expect((await alerts.recentAlerts())[0]).toMatchObject({ alert_key: 'mcp_builtin_down', notified: false });
    } finally {
      env.ALERT_WEBHOOK_URL = hook;
    }
  });
});
