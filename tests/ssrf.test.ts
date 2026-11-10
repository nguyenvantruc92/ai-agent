import { describe, expect, it } from 'vitest';
import { assertSafeUrl, isBlockedAddress } from '@/features/mcp/ssrf';

describe('isBlockedAddress', () => {
  it.each([
    '0.0.0.0', '10.1.2.3', '100.64.0.1', '127.0.0.1', '127.255.255.254', '169.254.169.254', '172.16.0.1', '172.31.255.255',
    '192.168.1.1', '198.18.0.1', '224.0.0.1', '240.0.0.1', '255.255.255.255',
    '::', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:a9fe:a9fe', '64:ff9b::7f00:1', '2001:db8::1',
  ])('blocks %s', (address) => expect(isBlockedAddress(address)).toBe(true));

  it.each(['8.8.8.8', '1.1.1.1', '172.15.255.255', '172.32.0.1', '192.169.0.1', '100.63.255.255', '2606:4700:4700::1111', '::ffff:8.8.8.8'])('allows public %s', (address) => expect(isBlockedAddress(address)).toBe(false));

  it('treats anything that is not an IP address as blocked', () => {
    expect(isBlockedAddress('not-an-ip')).toBe(true);
    expect(isBlockedAddress('1:2:3')).toBe(true);
  });
});

describe('assertSafeUrl', () => {
  it('rejects bad schemes, embedded credentials and malformed URLs', async () => {
    await expect(assertSafeUrl('ftp://example.com/mcp')).rejects.toThrow(/http/);
    await expect(assertSafeUrl('file:///etc/passwd')).rejects.toThrow(/http/);
    await expect(assertSafeUrl('https://user:pass@example.com/mcp')).rejects.toThrow(/tài khoản/);
    await expect(assertSafeUrl('không phải url')).rejects.toThrow(/không hợp lệ/);
  });

  it('rejects internal destinations written as IPs, including cloud metadata', async () => {
    for (const url of ['http://127.0.0.1:8080/mcp', 'http://169.254.169.254/latest/meta-data', 'http://10.0.0.5/mcp', 'http://[::1]/mcp', 'http://[::ffff:127.0.0.1]/mcp', 'http://0x7f.1/mcp', 'http://2130706433/mcp']) {
      await expect(assertSafeUrl(url), url).rejects.toThrow(/nội bộ|phân giải/);
    }
  });

  it('accepts the host of MCP_URL (the built-in server) even though it is private', async () => {
    // MCP_URL defaults to http://mcp:3001/mcp, which does not resolve outside Docker; an unresolvable allowed host must not be reported as blocked.
    const outcome = await assertSafeUrl('http://mcp:3001/mcp').then(() => 'ok', (error: Error) => error.message);
    expect(outcome).not.toMatch(/nội bộ/);
  });

  it('accepts a public IP literal', async () => {
    expect((await assertSafeUrl('https://8.8.8.8/mcp')).hostname).toBe('8.8.8.8');
  });
});
