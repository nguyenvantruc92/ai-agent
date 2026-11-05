import { modelOptions } from '@/features/ai/models';
import { listScopes } from '@/features/knowledge/scopes';
import { listServers } from '@/features/mcp/servers';
import { env } from '@/lib/env';

/** Options the agent form offers: scopes, MCP servers (with their ticked tools) and allowed models. */
export async function agentFormOptions() {
  const [scopes, servers] = await Promise.all([listScopes(), listServers()]);
  return {
    models: modelOptions(),
    // Shown as "Theo hệ thống (…)" in the history fields; an agent stores null to follow them.
    historyDefaults: { summaryEnabled: env.AGENT_SUMMARY_ENABLED, summarizeAfterMessages: env.AGENT_SUMMARIZE_AFTER_MESSAGES, keepRecentMessages: env.AGENT_KEEP_RECENT_MESSAGES },
    scopes: scopes.map((scope) => ({ id: scope.id, name: scope.name, toolName: scope.tool_name, description: scope.tool_description })),
    servers: servers.map((server) => ({ id: server.id, name: server.name, slug: server.slug, isBuiltin: server.is_builtin, enabled: server.enabled, tools: server.selected_tools })),
  };
}
