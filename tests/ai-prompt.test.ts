import { describe, expect, it } from 'vitest';
import { builtinToolCatalog, builtinToolNames } from '@/features/agent/tools';
import { agentPromptWriter, composeSystemPrompt, defaultAgentInstructions, defaultAgentPersona, defaultAgentRules, turnContextBlock } from '@/features/ai/prompt';
import { cleanGeneratedPrompt, describeAgent, generateAgentPrompt, MAX_GENERATED_PROMPT, type PromptBrief } from '@/features/ai/prompt-generator';
import { promptToolsSignature } from '@/features/ai/prompt-signature';

const context = { today: '2026-11-06', allowedSourceIds: ['product:PL-002', 'cart:current'], customerProfile: 'Chưa có.' };

describe('agent system prompt', () => {
  it('is the agent’s own instructions followed only by this turn’s facts', () => {
    const prompt = composeSystemPrompt('  Bạn là trợ lý thử nghiệm.  ', context);
    expect(prompt.startsWith('Bạn là trợ lý thử nghiệm.\n\n[NGỮ CẢNH LƯỢT NÀY')).toBe(true);
    expect(prompt).toContain('Hôm nay là 2026-11-06.');
    expect(prompt).toContain('product:PL-002, cart:current');
    expect(prompt).toContain('Thông tin khách đã lưu (chỉ để gợi ý, luôn xác nhận lại với khách): Chưa có.');
    expect(prompt.endsWith('[HẾT NGỮ CẢNH]')).toBe(true);
    // No rule is added by code: an agent with a one-line prompt gets that line and the facts, nothing else.
    expect(prompt.replace('Bạn là trợ lý thử nghiệm.', '').replace(turnContextBlock(context), '').trim()).toBe('');
  });

  it('says when there is no source to cite yet', () => {
    expect(turnContextBlock({ ...context, allowedSourceIds: [] })).toContain('Chưa có (chưa gọi tool nào trong lượt này).');
  });

  it('seeds the default agent with persona, scope and all rules, with no placeholders for code to fill', () => {
    expect(defaultAgentInstructions).toBe(`${defaultAgentPersona}\n\n${defaultAgentRules}`);
    expect(defaultAgentPersona).toContain('Fashion Tomodev');
    expect(defaultAgentPersona).toContain('## PHẠM VI');
    for (const rule of ['TRA ĐƠN VÀ XÁC MINH', 'ĐỔI SIZE / TRẢ HÀNG', 'MUA HÀNG', 'Không bao giờ tự xác nhận thay khách', 'Chỉ dùng dữ kiện có trong kết quả tool', 'FINAL_ANSWER', 'ten_may_chu__ten_tool']) {
      expect(defaultAgentRules).toContain(rule);
    }
    expect(defaultAgentInstructions).not.toContain('{{');
    // Written in the Markdown the admin editor understands.
    expect(defaultAgentInstructions).toMatch(/^## NGUYÊN TẮC CHUNG$/m);
    expect(defaultAgentInstructions).toMatch(/^- Chỉ làm những việc/m);
    // Every built-in tool the rules mention must exist.
    for (const name of ['lookup_order', 'search_products', 'add_to_cart', 'set_cart_quantity', 'checkout', 'cancel_order', 'create_exchange_request', 'create_return_request', 'lookup_product']) {
      expect(builtinToolNames).toContain(name);
    }
  });
});

describe('prompt writer', () => {
  const brief: PromptBrief = {
    agentName: 'Tư vấn', purpose: 'Thân thiện, xưng mình – bạn.',
    builtin: builtinToolCatalog(['search_products', 'checkout', 'create_return_request']),
    scopes: [{ name: 'Chính sách', toolName: 'search_policy', description: 'Tìm chính sách và FAQ.' }],
    externals: [{ name: 'weather__get_weather', serverName: 'Weather', description: 'Thời tiết', requiresApproval: false }, { name: 'weather__delete_all', serverName: 'Weather', description: '', requiresApproval: true }],
  };

  it('tells the writer what it must know about the platform and keeps the safety requirements', () => {
    for (const marker of ['final_answer', '## ', 'NGỮ CẢNH LƯỢT NÀY', 'số điện thoại', 'Xác nhận', 'nhân viên duyệt', 'không bịa', 'Không bao giờ tự xác nhận thay khách', '{{']) expect(agentPromptWriter).toContain(marker);
  });

  it('describes the agent: purpose, how each tool runs, scopes and external tools', () => {
    const text = describeAgent(brief);
    expect(text).toContain('Thân thiện, xưng mình – bạn.');
    expect(text).toMatch(/- search_products \[chỉ đọc dữ liệu, chạy ngay\]/);
    expect(text).toMatch(/- checkout \[khách phải bấm Xác nhận/);
    expect(text).toMatch(/- create_return_request \[chờ nhân viên duyệt/);
    expect(text).toContain('- search_policy (Chính sách): Tìm chính sách và FAQ.');
    expect(text).toContain('weather__delete_all [cần nhân viên duyệt] (Weather): (không có mô tả)');
    expect(text).not.toContain('add_to_cart');
    expect(text).not.toContain('PROMPT HIỆN TẠI');
  });

  it('includes the current prompt when improving one, and a fallback when the admin wrote nothing', () => {
    expect(describeAgent({ ...brief, currentInstructions: 'Bạn là Mai.' })).toContain('PROMPT HIỆN TẠI CỦA AGENT');
    expect(describeAgent({ ...brief, purpose: '  ' })).toContain('admin chưa mô tả');
    expect(describeAgent({ agentName: 'Trống', purpose: 'x', builtin: [], scopes: [], externals: [] })).toContain('TOOL CÓ SẴN (0):\n(không có)');
  });

  it('returns the model text as the prompt, without a code fence, and refuses empty or oversized output', async () => {
    const body = 'Bạn là trợ lý tư vấn thời trang nam. '.repeat(8);
    expect(await generateAgentPrompt(async () => `\`\`\`text\n${body}\n\`\`\``, brief)).toBe(body.trim());
    expect(() => cleanGeneratedPrompt('ngắn')).toThrow(/chưa viết được prompt/);
    expect(() => cleanGeneratedPrompt('x'.repeat(MAX_GENERATED_PROMPT + 1))).toThrow(/quá dài/);
  });
});

describe('prompt tools signature', () => {
  it('does not depend on the order tools were listed in, and changes with any tool, scope or approval flag', () => {
    const base = { builtin: ['search_products', 'checkout'], scopes: ['search_policy'], externals: [{ serverSlug: 'weather', toolName: 'get_weather', requiresApproval: false }] };
    const signature = promptToolsSignature(base);
    expect(promptToolsSignature({ ...base, builtin: ['checkout', 'search_products'] })).toBe(signature);
    expect(promptToolsSignature({ ...base, builtin: ['checkout'] })).not.toBe(signature);
    expect(promptToolsSignature({ ...base, scopes: [] })).not.toBe(signature);
    expect(promptToolsSignature({ ...base, externals: [{ ...base.externals[0], requiresApproval: true }] })).not.toBe(signature);
  });
});
