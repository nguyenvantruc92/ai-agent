'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useConfirm, useToast } from '@/components/admin/feedback';
import { EmptyState, PageHeader, td, th, thEnd } from '@/components/admin/page-header';
import { Badge } from '@/components/admin-ui/badge';
import { Button } from '@/components/admin-ui/button';
import { PlugIcon, PlusIcon } from '@/components/admin-ui/icons';
import { Switch } from '@/components/admin-ui/switch';
import type { ServerView } from '@/features/mcp/servers';
import { callApi } from '@/lib/client-api';

const authLabel = { none: 'Không', bearer: 'Bearer token', header: 'Header' } as const;
export const formatChecked = (value: string | null) => value ? new Date(value).toLocaleString('vi-VN') : null;

export function McpServersClient({ initial }: { initial: ServerView[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string>();

  async function test(server: ServerView) {
    setBusy(server.id);
    const result = await callApi<{ ok: boolean; message?: string; tools?: unknown[] }>(`/api/admin/mcp-servers/${server.id}/test`, { method: 'POST' });
    setBusy(undefined);
    if (!result.ok) toast('error', result.error);
    else if (result.data.ok) toast('success', `Kết nối được, ${result.data.tools?.length ?? 0} tool.`);
    else toast('error', result.data.message ?? 'Không kết nối được.');
    router.refresh();
  }

  async function toggle(server: ServerView, enabled: boolean) {
    if (!enabled && server.agents.length && !(await confirm({ title: `Tắt “${server.name}”?`, message: `Agent đang dùng: ${server.agents.map((agent) => agent.name).join(', ')}. Các Agent này sẽ bỏ qua tool của server.`, confirmLabel: 'Tắt server' }))) return;
    setBusy(server.id);
    const result = await callApi(`/api/admin/mcp-servers/${server.id}`, { method: 'PATCH', json: { enabled } });
    setBusy(undefined);
    if (!result.ok) toast('error', result.error); else toast('success', enabled ? 'Đã bật server.' : 'Đã tắt server.');
    router.refresh();
  }

  async function remove(server: ServerView) {
    if (!(await confirm({ title: `Xóa “${server.name}”?`, message: 'Thao tác này không thể hoàn tác.', confirmLabel: 'Xóa server', danger: true }))) return;
    setBusy(server.id);
    const result = await callApi(`/api/admin/mcp-servers/${server.id}`, { method: 'DELETE' });
    setBusy(undefined);
    if (!result.ok) toast('error', result.error); else toast('success', 'Đã xóa server.');
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="MCP Server" description="Danh sách MCP server mà Agent có thể dùng tool từ đó. Server có sẵn của hệ thống chứa tool tra đơn, giỏ hàng, đặt hàng, đổi/trả."
        actions={<Link href="/admin/mcp-servers/new"><Button><PlusIcon />Thêm server</Button></Link>} />
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="border-b border-gray-100 dark:border-white/5">
              <tr><th className={th}>Server</th><th className={th}>Xác thực</th><th className={th}>Kết nối</th><th className={thEnd}>Tool đã chọn</th><th className={th}>Agent đang dùng</th><th className={th}>Bật</th><th className="w-52" /></tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
              {initial.length === 0 && <tr><td colSpan={7}><EmptyState icon={<PlugIcon />} title="Chưa có MCP server" /></td></tr>}
              {initial.map((server) => (
                <tr key={server.id} className="hover:bg-gray-50 dark:hover:bg-white/2">
                  <td className={td}>
                    <Link className="font-medium text-gray-800 hover:underline dark:text-white/90" href={`/admin/mcp-servers/${server.id}`}>{server.name}</Link>
                    {server.is_builtin && <Badge color="primary" size="sm" className="ml-2">Có sẵn</Badge>}
                    <p className="mt-0.5 max-w-xs truncate font-mono text-theme-xs text-gray-500 dark:text-gray-400" title={server.url}>{server.url}</p>
                  </td>
                  <td className={td}>{authLabel[server.auth_type]}{server.has_secret && server.auth_hint ? <span className="text-gray-400"> · …{server.auth_hint}</span> : null}</td>
                  <td className={td}>
                    {server.last_status === 'ok' && <Badge color="success" size="sm">Hoạt động</Badge>}
                    {server.last_status === 'error' && <span title={server.last_error ?? undefined}><Badge color="error" size="sm">Lỗi</Badge></span>}
                    {!server.last_status && <Badge color="gray" size="sm">Chưa kiểm tra</Badge>}
                    {server.last_checked_at && <p className="mt-0.5 text-theme-xs text-gray-500 dark:text-gray-400">{formatChecked(server.last_checked_at)}</p>}
                  </td>
                  <td className={`${td} text-end tabular-nums`} title="Tool đã chọn / tool server liệt kê">{server.selected_tools.length}{server.is_builtin ? '' : `/${server.tools_cache.length}`}</td>
                  <td className={td}>{server.agents.length ? server.agents.map((agent) => agent.name).join(', ') : <span className="text-gray-400">—</span>}</td>
                  <td className={td}><Switch checked={server.enabled} disabled={server.is_builtin || busy === server.id} onCheckedChange={(checked) => void toggle(server, checked)} aria-label={`Bật ${server.name}`} /></td>
                  <td className="whitespace-nowrap px-5 py-3 text-end">
                    <Button size="xs" variant="ghost" disabled={busy === server.id} onClick={() => void test(server)}>Kiểm tra</Button>
                    <Link href={`/admin/mcp-servers/${server.id}`}><Button size="xs" variant="ghost">{server.is_builtin ? 'Xem' : 'Sửa'}</Button></Link>
                    {!server.is_builtin && <Button size="xs" variant="ghost" className="text-red-500 hover:text-red-600" disabled={busy === server.id} onClick={() => void remove(server)}>Xóa</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
