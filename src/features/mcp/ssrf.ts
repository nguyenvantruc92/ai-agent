import { lookup as dnsLookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import { env } from '@/lib/env';
import { HttpError } from '@/lib/http';

/**
 * Admins type MCP server URLs and the backend then calls them, so every address is checked before a connection is made:
 * no loopback, private, link-local (cloud metadata), CGNAT, multicast or reserved ranges, unless the host is listed in
 * MCP_ALLOWED_HOSTS (the built-in server's host always is). The check runs again at connect time on the resolved address,
 * so a DNS name that changes after it was saved cannot reach an internal address (DNS rebinding). Redirects are never followed.
 */

const V4_BLOCKED: [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24],
  ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];

function v4ToInt(address: string) {
  return address.split('.').reduce((total, part) => total * 256 + Number(part), 0);
}

/** Expands an IPv6 literal (with `::` and an optional dotted IPv4 tail) to a 128-bit integer. */
function v6ToBigInt(address: string): bigint | undefined {
  let text = address.split('%')[0].toLowerCase();
  const tail = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const n = v4ToInt(tail[1]);
    text = `${text.slice(0, -tail[1].length)}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return undefined;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return undefined;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...rest];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return undefined;
  return groups.reduce((total, group) => (total << 16n) | BigInt(`0x${group}`), 0n);
}

const inV6 = (value: bigint, base: bigint, bits: number) => value >> BigInt(128 - bits) === base >> BigInt(128 - bits);

/** True when the address must not be reached from the server (unparseable addresses count as blocked). */
export function isBlockedAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const value = v4ToInt(address);
    return V4_BLOCKED.some(([base, bits]) => Math.floor(value / 2 ** (32 - bits)) === Math.floor(v4ToInt(base) / 2 ** (32 - bits)));
  }
  if (version === 6) {
    const value = v6ToBigInt(address);
    if (value === undefined) return true;
    if (value === 0n || value === 1n) return true; // :: and ::1
    if (inV6(value, 0xffffn << 32n, 96)) return isBlockedAddress(`${(value >> 24n) & 255n}.${(value >> 16n) & 255n}.${(value >> 8n) & 255n}.${value & 255n}`); // ::ffff:a.b.c.d
    if (inV6(value, 0x64ff9bn << 96n, 96)) return true; // NAT64
    if (inV6(value, 0xfc00n << 112n, 7)) return true; // unique local
    if (inV6(value, 0xfe80n << 112n, 10)) return true; // link-local
    if (inV6(value, 0xffn << 120n, 8)) return true; // multicast
    if (inV6(value, 0x20010db8n << 96n, 32)) return true; // documentation
    return false;
  }
  return true;
}

/** Allowed hosts: MCP_ALLOWED_HOSTS entries plus the host of MCP_URL, as `host` or `host:port`. */
export function allowedHosts() {
  const entries = env.MCP_ALLOWED_HOSTS.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  try { entries.push(new URL(env.MCP_URL).host.toLowerCase()); } catch { /* MCP_URL is validated by the env schema */ }
  return new Set(entries);
}

function isAllowedHost(url: URL, allow = allowedHosts()) {
  return allow.has(url.host.toLowerCase()) || allow.has(url.hostname.toLowerCase());
}

type Resolved = { address: string; family: 4 | 6 };

async function resolveSafe(hostname: string, allowed: boolean): Promise<Resolved[]> {
  const bare = hostname.replace(/^\[|\]$/g, '');
  const addresses: Resolved[] = isIP(bare)
    ? [{ address: bare, family: isIP(bare) as 4 | 6 }]
    : (await dnsLookup(bare, { all: true, verbatim: true })).map((item) => ({ address: item.address, family: item.family as 4 | 6 }));
  if (!addresses.length) throw new HttpError('Không phân giải được tên miền của MCP server.', 400);
  if (!allowed && addresses.some((item) => isBlockedAddress(item.address))) {
    throw new HttpError('Địa chỉ MCP server trỏ tới mạng nội bộ/địa chỉ bị chặn. Chỉ host trong MCP_ALLOWED_HOSTS mới được dùng địa chỉ nội bộ.', 400);
  }
  return addresses;
}

/** Validates a URL typed by an admin (shape, scheme, credentials, destination). Returns the parsed URL. */
export async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new HttpError('URL của MCP server không hợp lệ.', 400); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new HttpError('URL của MCP server phải bắt đầu bằng http:// hoặc https://.', 400);
  if (url.username || url.password) throw new HttpError('Không đặt tài khoản/mật khẩu trong URL; dùng ô xác thực bên dưới.', 400);
  try { await resolveSafe(url.hostname, isAllowedHost(url)); }
  catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError('Không phân giải được tên miền của MCP server.', 400);
  }
  return url;
}

/** A `fetch` that refuses blocked destinations at connect time, never follows redirects and caps the response size. */
export function guardedFetch(options: { allowed?: ReadonlySet<string> } = {}) {
  const allow = options.allowed ?? allowedHosts();
  return (input: string | URL, init: RequestInit = {}): Promise<Response> => new Promise((resolve, reject) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') { reject(new HttpError('Giao thức MCP không được hỗ trợ.', 400)); return; }
    const allowed = isAllowedHost(url, allow as Set<string>);
    const headers = new Headers(init.headers);
    headers.set('accept-encoding', 'identity');
    if (init.signal?.aborted) { reject(init.signal.reason ?? new Error('aborted')); return; }

    const request = (url.protocol === 'https:' ? https : http).request(url, {
      method: init.method ?? 'GET',
      headers: Object.fromEntries(headers.entries()),
      // Resolved and checked again on the address actually used for the connection.
      lookup: (hostname, lookupOptions, callback) => {
        resolveSafe(hostname, allowed).then((addresses) => {
          if ((lookupOptions as { all?: boolean }).all) (callback as unknown as (error: null, list: Resolved[]) => void)(null, addresses);
          else callback(null, addresses[0].address, addresses[0].family);
        }, (error: Error) => (callback as (error: Error) => void)(error));
      },
    }, (response) => {
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400) { response.resume(); reject(new HttpError('MCP server trả về chuyển hướng (redirect); hệ thống không theo redirect. Hãy nhập URL cuối cùng.', 400)); return; }
      let received = 0;
      const limited = new Readable({ read() { response.resume(); } });
      response.on('data', (chunk: Buffer) => {
        received += chunk.length;
        if (received > env.MCP_MAX_RESPONSE_BYTES) { limited.destroy(new HttpError('Phản hồi của MCP server quá lớn.', 502)); response.destroy(); return; }
        if (!limited.push(chunk)) response.pause();
      });
      response.on('end', () => limited.push(null));
      response.on('error', (error) => limited.destroy(error));
      const responseHeaders = new Headers();
      for (const [key, value] of Object.entries(response.headers)) if (value !== undefined) responseHeaders.set(key, Array.isArray(value) ? value.join(', ') : value);
      const noBody = status === 204 || status === 205 || status === 304;
      resolve(new Response(noBody ? null : (Readable.toWeb(limited) as ReadableStream), { status, statusText: response.statusMessage, headers: responseHeaders }));
    });
    request.setTimeout(env.MCP_TOOL_TIMEOUT_MS, () => request.destroy(new Error('MCP server không phản hồi kịp thời gian cho phép.')));
    request.on('error', reject);
    init.signal?.addEventListener('abort', () => request.destroy(init.signal!.reason instanceof Error ? init.signal!.reason : new Error('aborted')), { once: true });
    if (init.body === undefined || init.body === null) request.end();
    else request.end(typeof init.body === 'string' ? init.body : Buffer.from(init.body as ArrayBuffer));
  });
}
