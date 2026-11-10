import { describe, expect, it } from 'vitest';
import { buildAgentTools, builtinToolNames, externalModelName, reservedToolNames, type ExternalToolSpec } from '@/features/agent/tools';

describe('externalModelName', () => {
  it('prefixes the server slug and keeps valid names as they are', () => {
    expect(externalModelName('weather', 'get_weather', new Set())).toBe('weather__get_weather');
  });

  it('replaces characters OpenAI rejects', () => {
    expect(externalModelName('crm', 'orders.list v2', new Set())).toBe('crm__orders_list_v2');
  });

  it('shortens long names to 64 characters with a stable hash suffix', () => {
    const name = externalModelName('weather', 'x'.repeat(100), new Set());
    expect(name).toHaveLength(64);
    expect(name).toBe(externalModelName('weather', 'x'.repeat(100), new Set()));
    expect(name).not.toBe(externalModelName('weather', `${'x'.repeat(99)}y`, new Set()));
  });

  it('keeps names unique when two tools sanitise to the same text', () => {
    const first = externalModelName('crm', 'a b', new Set());
    const second = externalModelName('crm', 'a.b', new Set([first]));
    expect(second).not.toBe(first);
    expect(second.startsWith('crm__a_b')).toBe(true);
  });
});

describe('buildAgentTools', () => {
  const spec: ExternalToolSpec = { modelName: 'weather__get_weather', serverId: 's', serverName: 'Thời tiết', serverSlug: 'weather', toolName: 'get_weather', description: 'Thời tiết', inputSchema: { type: 'object', properties: { city: { type: 'string' } } }, requiresApproval: false };

  it('contains only the enabled built-ins, the scope tools, the external tools and final_answer (last)', () => {
    const names = buildAgentTools(new Set(['view_cart', 'checkout']), [{ toolName: 'search_policy', description: 'Chính sách' }], [spec]).map((item) => item.name);
    expect(names.sort()).toEqual(['checkout', 'final_answer', 'search_policy', 'view_cart', 'weather__get_weather'].sort());
    expect(buildAgentTools(new Set(), [], []).map((item) => item.name)).toEqual(['final_answer']);
  });

  it('forces an object root on external schemas and prefixes the description with the server name', () => {
    const [tool] = buildAgentTools(new Set(), [], [{ ...spec, inputSchema: {} }]);
    expect(tool.description).toBe('[Thời tiết] Thời tiết');
    expect(tool.name).toBe('weather__get_weather');
  });

  it('reserves every built-in tool name for scope tools', () => {
    for (const name of builtinToolNames) expect(reservedToolNames.has(name)).toBe(true);
  });
});
