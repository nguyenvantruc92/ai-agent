import { McpServersClient } from '@/components/admin/mcp-servers-client';
import { listServers } from '@/features/mcp/servers';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'MCP Server · Admin' };

export default async function McpServersPage() {
  return <McpServersClient initial={await listServers()} />;
}
