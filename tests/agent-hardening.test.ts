import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { describe, expect, it } from 'vitest';
import { createConversationSummary } from '@/features/agent/graph';
import { hasInternalMcpAccess } from '@/mcp/internal-auth';

describe('internal MCP authentication', () => {
  it('accepts only the exact bearer token', () => {
    const token = 'a-safe-internal-token-with-at-least-24-chars';
    expect(hasInternalMcpAccess(undefined, token)).toBe(false);
    expect(hasInternalMcpAccess('Bearer incorrect-token', token)).toBe(false);
    expect(hasInternalMcpAccess(`Bearer ${token}`, token)).toBe(true);
  });
});

describe('conversation compaction', () => {
  it('keeps communication context but excludes tool payloads and redacts phones', () => {
    const messages = [
      new HumanMessage('Tôi cần đổi size, số điện thoại 0912 345 678'),
      new AIMessage({ content: '', tool_calls: [{ id: 'tool-1', name: 'lookup_order', args: { order_id: 'FT-1' } }] }),
      new ToolMessage({ tool_call_id: 'tool-1', name: 'lookup_order', content: '{"total":999000,"phone":"0912345678"}' }),
      new AIMessage('Mình sẽ kiểm tra điều kiện đổi size cho bạn.'),
    ];
    const summary = createConversationSummary(messages, messages.length);
    expect(summary).toContain('đổi size');
    expect(summary).toContain('[phone]');
    expect(summary).not.toContain('999000');
    expect(summary).not.toContain('lookup_order');
  });
});
