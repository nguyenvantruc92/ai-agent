import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import { InMemoryStore, MemorySaver } from '@langchain/langgraph';
import { describe, expect, it } from 'vitest';
import { agentInput } from '@/features/ai/agent-admin';
import { resolveHistory } from '@/features/ai/agents';
import { closeDanglingToolCalls, compileAgentGraph } from '@/features/agent/graph';
import { env } from '@/lib/env';
import { fakeApprovals, fakeConfirmations, fakeGateway, NOW, scriptedModel, testAgent } from './fakes';

/** What the provider requires: every tool call answered before the next human/AI turn, no result without its call. */
function expectValidForProvider(messages: BaseMessage[]) {
  const open = new Set<string>();
  for (const message of messages) {
    if (ToolMessage.isInstance(message)) {
      expect(open.has(message.tool_call_id), `orphan ToolMessage ${message.tool_call_id}`).toBe(true);
      open.delete(message.tool_call_id);
    } else {
      expect([...open], 'tool call without result').toEqual([]);
      if (AIMessage.isInstance(message)) for (const call of message.tool_calls ?? []) open.add(call.id!);
    }
  }
  expect([...open]).toEqual([]);
}

const turn = (message: string) => ({ messages: [new HumanMessage(message)], userId: 'visitor-hash', route: null, finalAnswer: null, turnSources: [], modelCalls: 0, toolCalls: 0, approvalStatus: 'none' as const });
const config = (threadId: string) => ({ configurable: { thread_id: threadId, trace_id: 'test' } });
function setup(model: ReturnType<typeof scriptedModel>['model'], agent = testAgent()) {
  const { gateway } = fakeGateway();
  return compileAgentGraph({ model, gateway, approvals: fakeApprovals().store, confirmations: fakeConfirmations().store, loadAgent: async () => agent, now: () => NOW }, new MemorySaver(), new InMemoryStore());
}
/** One product search and a plain answer per turn (no numbers, so no re-grounding step). */
const searchTurns = (count: number) => Array.from({ length: count }, () => [
  { name: 'search_products', args: { query: 'áo polo', max_price_vnd: null } },
  { name: 'final_answer', args: { answer: 'Có mẫu áo polo trắng phù hợp với bạn.', cited_source_ids: [], insufficient_information: false } },
]).flat();

describe('closeDanglingToolCalls', () => {
  it('closes each unanswered call right after its own results and leaves complete histories unchanged', () => {
    const complete = [new HumanMessage('a'), new AIMessage({ content: '', tool_calls: [{ id: 'c1', name: 'view_cart', args: {} }] }), new ToolMessage({ tool_call_id: 'c1', content: '{}' }), new AIMessage('ok')];
    expect(closeDanglingToolCalls(complete)).toEqual(complete);

    const interrupted = [
      new HumanMessage('mua áo'),
      new AIMessage({ content: '', tool_calls: [{ id: 'c1', name: 'view_cart', args: {} }, { id: 'c2', name: 'search_products', args: {} }] }),
      new ToolMessage({ tool_call_id: 'c1', content: '{}' }),
      new HumanMessage('còn không?'),
    ];
    const closed = closeDanglingToolCalls(interrupted);
    expect(closed.map((message) => message.getType())).toEqual(['human', 'ai', 'tool', 'tool', 'human']);
    expect((closed[3] as ToolMessage).tool_call_id).toBe('c2');
    expect(String(closed[3].content)).toContain('chưa chạy');
    expectValidForProvider(closed);
    expect(interrupted).toHaveLength(4);
  });
});

describe('long conversations', () => {
  it('keeps 25 turns with tool calls valid for the provider, summarises the old part and bounds the request', async () => {
    const script = scriptedModel(searchTurns(25));
    const graph = setup(script.model);
    let state;
    for (let index = 0; index < 25; index += 1) state = await graph.invoke(turn(`Lượt ${index + 1}: còn áo polo trắng không?`), config('t-long'));

    expect(script.seen).toHaveLength(50);
    for (const request of script.seen) expectValidForProvider(request.filter((message) => !SystemMessage.isInstance(message)));
    // 16 recent messages kept verbatim (whole turns), plus at most the current turn: never the full 100+ messages.
    expect(Math.max(...script.seen.map((request) => request.length))).toBeLessThanOrEqual(1 + 16 + 4);
    expect(state!.messages.length).toBeGreaterThan(90);
    expect(state!.conversationSummary).toContain('Khách: Lượt');
    expect(state!.conversationSummary).not.toContain('search_products');
    expect(String(script.seen.at(-1)![0].content)).toContain('TÓM TẮT HỘI THOẠI CŨ');
  });

  it('follows the agent: no summary when disabled, and a shorter verbatim window', async () => {
    const script = scriptedModel(searchTurns(12));
    const graph = setup(script.model, testAgent({ history: { summaryEnabled: false, summarizeAfterMessages: 8, keepRecentMessages: 6 } }));
    let state;
    for (let index = 0; index < 12; index += 1) state = await graph.invoke(turn(`Câu ${index + 1}`), config('t-agent-history'));
    expect(state!.conversationSummary ?? null).toBeNull();
    expect(String(script.seen.at(-1)![0].content)).not.toContain('TÓM TẮT HỘI THOẠI CŨ');
    expect(Math.max(...script.seen.map((request) => request.length))).toBeLessThanOrEqual(1 + 6 + 4);
  });

  it('recovers from a turn interrupted between a tool call and its result', async () => {
    const script = scriptedModel(searchTurns(1));
    const graph = setup(script.model);
    const interrupted = [new HumanMessage('Xem giỏ giúp mình'), new AIMessage({ content: '', tool_calls: [{ id: 'lost-1', name: 'view_cart', args: {}, type: 'tool_call' }] })];
    await graph.invoke({ ...turn('x'), messages: [...interrupted, new HumanMessage('Có áo polo không?')] }, config('t-interrupted'));
    const [first] = script.seen;
    expectValidForProvider(first.filter((message) => !SystemMessage.isInstance(message)));
    expect(first.some((message) => ToolMessage.isInstance(message) && message.tool_call_id === 'lost-1')).toBe(true);
  });
});

describe('agent history settings', () => {
  const base = { name: 'Agent thử', slug: 'agent-thu', instructions: 'Bạn là trợ lý thử nghiệm của cửa hàng.', model: 'm', temperature: 0.3, maxSteps: 5, maxToolCalls: 5 };

  it('uses env defaults for null columns and the agent value otherwise', () => {
    expect(resolveHistory({ summary_enabled: null, summarize_after_messages: null, keep_recent_messages: null }))
      .toEqual({ summaryEnabled: env.AGENT_SUMMARY_ENABLED, summarizeAfterMessages: env.AGENT_SUMMARIZE_AFTER_MESSAGES, keepRecentMessages: env.AGENT_KEEP_RECENT_MESSAGES });
    expect(resolveHistory({ summary_enabled: false, summarize_after_messages: 40, keep_recent_messages: 10 })).toEqual({ summaryEnabled: false, summarizeAfterMessages: 40, keepRecentMessages: 10 });
  });

  it('validates ranges and keeps the summary threshold above the verbatim window', () => {
    expect(agentInput.parse(base)).toMatchObject({ summaryEnabled: null, summarizeAfterMessages: null, keepRecentMessages: null });
    expect(agentInput.safeParse({ ...base, summarizeAfterMessages: 10, keepRecentMessages: 12 }).error?.issues[0].message).toBe('Ngưỡng tóm tắt phải lớn hơn số tin nhắn giữ nguyên văn.');
    expect(agentInput.safeParse({ ...base, keepRecentMessages: 2 }).success).toBe(false);
    expect(agentInput.safeParse({ ...base, summarizeAfterMessages: 500 }).success).toBe(false);
    expect(agentInput.safeParse({ ...base, summaryEnabled: true, summarizeAfterMessages: 30, keepRecentMessages: 12 }).success).toBe(true);
  });
});
