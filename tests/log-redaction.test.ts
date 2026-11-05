import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { HumanMessage } from '@langchain/core/messages';
import { InMemoryStore, MemorySaver } from '@langchain/langgraph';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { compileAgentGraph, type AgentModel } from '@/features/agent/graph';
import { chatReceivedLog } from '@/features/chat/trace';
import { createLogger } from '@/lib/logger';
import { redactText, ref, safeError } from '@/lib/redact';
import { handler } from '@/mcp/handler';
import { fakeApprovals, fakeConfirmations, fakeGateway, NOW, scriptedModel, testAgent } from './fakes';

// Every app log line goes to this buffer instead of data/logs, with the real options (including pino redaction).
const captured = vi.hoisted(() => ({ lines: [] as string[] }));
vi.mock('@/lib/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/logger')>();
  const stream = { write: (line: string) => { captured.lines.push(line); } };
  return { ...actual, logger: actual.createLogger(stream, 'info'), workerLogger: actual.createLogger(stream, 'info') };
});

const PHONE = '0912 345 678';
const EMAIL = 'lan.nguyen@example.com';
const ADDRESS = '12 Nguyễn Huệ, Quận 1';
const THREAD = '3f1c2a9e-7d4b-4e8a-9c1f-2b6d8e0a4c5d';
const logText = () => captured.lines.join('');
const expectNoPii = (text: string) => {
  for (const secret of [PHONE, PHONE.replace(/ /g, ''), EMAIL, ADDRESS, THREAD]) expect(text).not.toContain(secret);
};

beforeEach(() => { captured.lines.length = 0; });

describe('redactText', () => {
  it.each([
    ['0912345678', '[phone]'],
    ['SĐT 0912 345 678 nhé', 'SĐT [phone] nhé'],
    ['+84 912.345.678', '[phone]'],
    ['84912345678', '[phone]'],
    ['(091) 234-5678', '[phone]'],
    ['028 3823 4567', '[phone]'],
    ['email lan.nguyen@example.com', 'email [email]'],
    ['STK 190312345678', 'STK [number]'],
    ['thẻ 4111 1111 1111 1111', 'thẻ [number]'],
  ])('redacts %s', (input, expected) => {
    expect(redactText(input)).toBe(expected);
  });

  it.each([
    'Đơn FT-2026-1001 áo SM-001 size L',
    'Giá 799.000đ, phí ship 30.000đ, tổng 1.299.000đ',
    'Đặt ngày 05-11-2026 lúc 10:30',
    'Còn 12 sản phẩm, mã giảm 2026',
  ])('keeps business text readable: %s', (input) => {
    expect(redactText(input)).toBe(input);
  });
});

describe('safeError and ref', () => {
  it('redacts and bounds error messages', () => {
    expect(safeError(new Error(`Số ${PHONE} không khớp đơn`))).toBe('Số [phone] không khớp đơn');
    expect(safeError('x'.repeat(1_000))).toHaveLength(301);
  });

  it('gives a stable pseudonym that does not contain the ID', () => {
    expect(ref(THREAD)).toBe(ref(THREAD));
    expect(ref(THREAD)).not.toBe(ref('another-thread'));
    expect(ref(THREAD)).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('logger redaction', () => {
  it('censors PII fields even when a call site logs a whole object', () => {
    const lines: string[] = [];
    const log = createLogger({ write: (line: string) => { lines.push(line); } }, 'info');
    log.info({ stage: 'test', args: { phone: PHONE }, input: { phone: PHONE, email: EMAIL, address: ADDRESS }, question: ADDRESS });
    const [line] = lines;
    expectNoPii(line);
    expect(JSON.parse(line)).toMatchObject({ stage: 'test', args: '[redacted]', input: { phone: '[redacted]' }, question: '[redacted]' });
  });

  it('logs chat.received without the message text', () => {
    const fields = chatReceivedLog('trace-1', THREAD, `Giao tới ${ADDRESS}, SĐT ${PHONE}, mail ${EMAIL}`);
    expectNoPii(JSON.stringify(fields));
    expect(fields).toMatchObject({ stage: 'chat.received', threadRef: ref(THREAD), questionChars: expect.any(Number) });
    expect(fields).not.toHaveProperty('questionRedacted');
  });
});

describe('MCP tool handler', () => {
  it('never logs args, redacts a failure, and still returns the plain message to the model', async () => {
    const ok = handler<{ thread_id: string; phone: string }>('verify_order', async () => ({ verified: true }));
    await ok({ thread_id: THREAD, phone: PHONE }, { _meta: { traceId: 'trace-ok' } });

    const failing = handler<{ phone: string }>('verify_order', async ({ phone }) => { throw new Error(`Số ${phone} không khớp đơn`); });
    const result = await failing({ phone: PHONE }, { _meta: { traceId: 'trace-fail' } });

    expect(result).toMatchObject({ isError: true, content: [{ text: `Số ${PHONE} không khớp đơn` }] });
    expectNoPii(logText());
    expect(logText()).toContain('[phone]');
    expect(captured.lines.map((line) => JSON.parse(line).stage)).toEqual(['mcp.tool', 'mcp.tool_failed']);
  });
});

describe('agent turn logs', () => {
  const setup = (model: AgentModel, gatewayOverrides = {}) => {
    const { gateway } = fakeGateway();
    const deps = { model, gateway: { ...gateway, ...gatewayOverrides }, approvals: fakeApprovals().store, confirmations: fakeConfirmations().store, loadAgent: async () => testAgent(), now: () => NOW };
    return compileAgentGraph(deps, new MemorySaver(), new InMemoryStore());
  };
  const turn = (message: string) => ({ messages: [new HumanMessage(message)], userId: 'visitor-hash', route: null, finalAnswer: null, turnSources: [], modelCalls: 0, toolCalls: 0, approvalStatus: 'none' as const });
  const config = { configurable: { thread_id: THREAD, trace_id: 'trace-graph' } };
  const message = `Đơn FT-2026-1001 của mình, SĐT ${PHONE}, email ${EMAIL}, giao tới ${ADDRESS}. Mình muốn đổi size L.`;

  it('keeps PII out of logs when a tool fails with customer data in its error', async () => {
    const script = scriptedModel([
      { name: 'lookup_order', args: { order_id: 'FT-2026-1001', phone: PHONE } },
      { name: 'final_answer', args: { answer: 'Mình chưa xác minh được đơn.', cited_source_ids: [], insufficient_information: true } },
    ]);
    const graph = setup(script.model, { verifyOrder: async (_thread: string, _id: string, phone: string | null) => { throw new Error(`Không khớp ${phone} / ${EMAIL}`); } });
    await graph.invoke(turn(message), config);

    expect(captured.lines.length).toBeGreaterThan(0);
    expectNoPii(logText());
  });

  it('keeps PII out of logs when the model provider fails', async () => {
    const model: AgentModel = { invoke: async () => { throw new Error(`Provider rejected input containing ${PHONE} and ${EMAIL}`); } };
    await expect(setup(model).invoke(turn(message), config)).rejects.toThrow();

    expect(logText()).toContain('graph.node_failed');
    expectNoPii(logText());
  });
});

describe('log call sites', () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
  });

  it('do not log raw error messages, tool args or request bodies', () => {
    const offenders = files(join(process.cwd(), 'src')).flatMap((path) => readFileSync(path, 'utf8').split('\n')
      .map((line, index) => ({ line, at: `${path}:${index + 1}` }))
      .filter(({ line }) => /[lL]ogger\.(?:info|warn|error|debug)\(/.test(line))
      // A raw thread ID or phone as a log field (`threadId,` / `phone: x`); `ref(x.threadId)` is fine.
      .filter(({ line }) => /error\.message|String\(error\)|\bargs\b|\bbody\b|[{,]\s*(?:threadId|visitorId|phone)\s*[,}:]/.test(line))
      .map(({ at }) => at));
    expect(offenders).toEqual([]);
  });
});
