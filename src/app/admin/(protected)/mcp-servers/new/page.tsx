import Link from 'next/link';
import { McpServerForm } from '@/components/admin/mcp-server-form';
import { PageHeader } from '@/components/admin/page-header';
import { ArrowLeftIcon } from '@/components/admin-ui/icons';

export const metadata = { title: 'Thêm MCP server · Admin' };

export default function NewMcpServerPage() {
  return (
    <div className="space-y-6">
      <Link href="/admin/mcp-servers" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"><ArrowLeftIcon className="size-4" />MCP Server</Link>
      <PageHeader title="Thêm MCP server" description="Chỉ hỗ trợ MCP qua HTTP (Streamable HTTP). Nhập kết nối, lấy danh sách tool, tick tool cần dùng rồi lưu." />
      <McpServerForm />
    </div>
  );
}
