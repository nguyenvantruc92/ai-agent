import Link from 'next/link';
import { notFound } from 'next/navigation';
import { McpServerForm } from '@/components/admin/mcp-server-form';
import { PageHeader } from '@/components/admin/page-header';
import { Badge } from '@/components/admin-ui/badge';
import { ArrowLeftIcon } from '@/components/admin-ui/icons';
import { builtinToolKind, builtinToolNames } from '@/features/agent/tools';
import { getServer } from '@/features/mcp/servers';
import { HttpError } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'MCP server · Admin' };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function McpServerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid.test(id)) notFound();
  const server = await getServer(id).catch((error) => { if (error instanceof HttpError && error.status === 404) return undefined; throw error; });
  if (!server) notFound();
  return (
    <div className="space-y-6">
      <Link href="/admin/mcp-servers" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"><ArrowLeftIcon className="size-4" />MCP Server</Link>
      <PageHeader title={server.name} actions={<>{server.is_builtin && <Badge color="primary">Có sẵn</Badge>}<Badge color={server.enabled ? 'success' : 'gray'}>{server.enabled ? 'Đang bật' : 'Đã tắt'}</Badge></>} />
      <McpServerForm key={server.updated_at} server={server} builtinTools={server.is_builtin ? builtinToolNames.map((name) => ({ name, kind: builtinToolKind(name) })) : undefined} />
    </div>
  );
}
