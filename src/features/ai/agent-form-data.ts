import { allowedModels } from '@/features/ai/models';
import { listScopes } from '@/features/knowledge/scopes';
import { listServers } from '@/features/mcp/servers';

/** Options the agent form offers: scopes, MCP servers (with their ticked tools) and allowed models. */
export async function agentFormOptions() {
  const [scopes, servers] = await Promise.all([listScopes(), listServers()]);
  return {
    models: allowedModels(),
    scopes: scopes.map((scope) => ({ id: scope.id, name: scope.name, toolName: scope.tool_name, description: scope.tool_description })),
    servers: servers.map((server) => ({ id: server.id, name: server.name, slug: server.slug, isBuiltin: server.is_builtin, enabled: server.enabled, tools: server.selected_tools })),
  };
}
