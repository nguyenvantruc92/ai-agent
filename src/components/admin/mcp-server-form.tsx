'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatChecked } from '@/components/admin/mcp-servers-client';
import { useToast } from '@/components/admin/feedback';
import { FormField, NativeSelect } from '@/components/admin/form';
import { Panel, td, th } from '@/components/admin/page-header';
import { Badge } from '@/components/admin-ui/badge';
import { Button } from '@/components/admin-ui/button';
import { Input } from '@/components/admin-ui/input';
import type { McpToolInfo, ServerView } from '@/features/mcp/servers';
import { callApi } from '@/lib/client-api';
import { slugify } from '@/lib/slug';

type AuthType = 'none' | 'bearer' | 'header';
export type BuiltinToolOption = { name: string; kind: 'read' | 'cart' | 'confirm' | 'approval' };
type Pick = { requiresApproval: boolean };

const kindBadge = {
  read: { label: 'Chỉ đọc', color: 'gray' },
  cart: { label: 'Sửa giỏ (chạy ngay)', color: 'info' },
  confirm: { label: 'Khách xác nhận', color: 'warning' },
  approval: { label: 'Nhân viên duyệt', color: 'error' },
} as const;

/**
 * Create or edit one MCP server. For an external server: fill in the connection, "Lấy danh sách tool" (nothing is saved yet), tick
 * the tools the agents may use, then save. Agents pick whole servers and get every ticked tool. The saved secret never comes back:
 * leave the field empty to keep it.
 */
export function McpServerForm({ server, builtinTools = [] }: { server?: ServerView; builtinTools?: BuiltinToolOption[] }) {
  const router = useRouter();
  const toast = useToast();
  const builtin = server?.is_builtin ?? false;
  const [name, setName] = useState(server?.name ?? '');
  const [slug, setSlug] = useState(server?.slug ?? '');
  const [slugEdited, setSlugEdited] = useState(Boolean(server));
  const [url, setUrl] = useState(server?.url ?? '');
  const [authType, setAuthType] = useState<AuthType>(server?.auth_type ?? 'none');
  const [headerName, setHeaderName] = useState(server?.auth_header_name ?? '');
  const [secret, setSecret] = useState('');
  const [tools, setTools] = useState<McpToolInfo[]>(server?.tools_cache ?? []);
  const [picked, setPicked] = useState<Record<string, Pick>>(() => Object.fromEntries((server?.selected_tools ?? []).map((tool) => [tool.name, { requiresApproval: tool.requiresApproval }])));
  const [fetchedWith, setFetchedWith] = useState(() => server ? JSON.stringify([server.url, server.auth_type, server.auth_header_name]) : '');
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string>();
  const [dropped, setDropped] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const connection = JSON.stringify([url.trim(), authType, authType === 'header' ? headerName : null]);
  const stale = !builtin && tools.length > 0 && connection !== fetchedWith;
  const options = useMemo(() => builtin ? builtinTools.map((tool) => ({ name: tool.name })) : tools.map((tool) => ({ name: tool.name })), [builtin, builtinTools, tools]);
  const pickedCount = options.filter((tool) => picked[tool.name]).length;

  function toggle(tool: { name: string }, info?: McpToolInfo) {
    setPicked((current) => {
      if (current[tool.name]) { const { [tool.name]: _removed, ...rest } = current; void _removed; return rest; }
      // A tool that may change things starts out needing staff approval; the admin can untick it.
      return { ...current, [tool.name]: { requiresApproval: Boolean(info?.destructive) } };
    });
  }
  const selectAll = () => setPicked((current) => Object.fromEntries(options.map((tool) => [tool.name, current[tool.name] ?? { requiresApproval: Boolean(tools.find((item) => item.name === tool.name)?.destructive) }])));
  const selectNone = () => setPicked({});

  async function fetchTools() {
    setFetching(true); setFetchError(undefined);
    const result = await callApi<{ ok: boolean; message?: string; tools?: McpToolInfo[] }>('/api/admin/mcp-servers/discover', { json: { url, authType, authHeaderName: authType === 'header' ? headerName : undefined, authSecret: secret || undefined, serverId: server?.id } });
    setFetching(false);
    if (!result.ok) { toast('error', result.error); return; }
    if (!result.data.ok) { setFetchError(result.data.message ?? 'Không kết nối được.'); toast('error', result.data.message ?? 'Không kết nối được.'); return; }
    const fresh = result.data.tools ?? [];
    const listed = new Set(fresh.map((tool) => tool.name));
    setDropped(Object.keys(picked).filter((toolName) => !listed.has(toolName)));
    setPicked((current) => Object.fromEntries(Object.entries(current).filter(([toolName]) => listed.has(toolName))));
    setTools(fresh);
    setFetchedWith(connection);
    toast('success', `Lấy được ${fresh.length} tool. Tick các tool cần dùng rồi lưu.`);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const selectedTools = options.filter((tool) => picked[tool.name]).map((tool) => ({ name: tool.name, requiresApproval: builtin ? false : picked[tool.name].requiresApproval }));
    const result = builtin
      ? await callApi(`/api/admin/mcp-servers/${server!.id}/tools`, { method: 'PUT', json: { selectedTools } })
      : server
        ? await callApi(`/api/admin/mcp-servers/${server.id}`, { method: 'PUT', json: { name, slug, url, authType, authHeaderName: authType === 'header' ? headerName : undefined, authSecret: secret || undefined, selectedTools } })
        : await callApi<{ id: string }>('/api/admin/mcp-servers', { json: { name, slug, url, authType, authHeaderName: authType === 'header' ? headerName : undefined, authSecret: secret || undefined, selectedTools } });
    setSaving(false);
    if (!result.ok) { toast('error', result.error); return; }
    setSecret('');
    toast('success', server ? 'Đã lưu MCP server.' : 'Đã thêm MCP server.');
    if (server) router.refresh(); else router.push(`/admin/mcp-servers/${(result.data as { id: string }).id}`);
  }

  async function checkConnection() {
    if (!server) return;
    setFetching(true);
    const result = await callApi<{ ok: boolean; message?: string; tools?: unknown[] }>(`/api/admin/mcp-servers/${server.id}/test`, { method: 'POST' });
    setFetching(false);
    if (!result.ok) toast('error', result.error);
    else if (result.data.ok) toast('success', `Kết nối được, ${result.data.tools?.length ?? 0} tool.`);
    else toast('error', result.data.message ?? 'Không kết nối được.');
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-6">
      {!builtin && (
        <Panel title="Kết nối">
          <div className="grid gap-5 px-5 pb-5 sm:px-6 lg:grid-cols-2">
            <FormField label="Tên"><Input required minLength={2} maxLength={80} value={name} placeholder="Thời tiết"
              onChange={(event) => { setName(event.target.value); if (!slugEdited) setSlug(slugify(event.target.value).replace(/-/g, '_').replace(/^[^a-z]+/, '').slice(0, 31)); }} /></FormField>
            <FormField label="Mã (slug)" hint="Dùng làm tiền tố tên tool (mã__tên_tool). Chữ thường, số, dấu gạch dưới."><Input required maxLength={31} className="font-mono" value={slug} placeholder="weather"
              onChange={(event) => { setSlug(event.target.value); setSlugEdited(true); }} /></FormField>
            <FormField className="lg:col-span-2" label="URL (Streamable HTTP)" hint="Địa chỉ endpoint MCP, thường kết thúc bằng /mcp. Không nhận địa chỉ nội bộ (localhost, mạng riêng, cloud metadata) trừ khi nằm trong MCP_ALLOWED_HOSTS.">
              <Input required type="url" maxLength={500} className="font-mono" value={url} placeholder="https://mcp.example.com/mcp" onChange={(event) => setUrl(event.target.value)} />
            </FormField>
            <FormField label="Xác thực">
              <NativeSelect value={authType} onChange={(event) => setAuthType(event.target.value as AuthType)}>
                <option value="none">Không</option><option value="bearer">Bearer token</option><option value="header">Header tùy chọn</option>
              </NativeSelect>
            </FormField>
            {authType === 'header' && <FormField label="Tên header"><Input required maxLength={60} className="font-mono" value={headerName} placeholder="x-api-key" onChange={(event) => setHeaderName(event.target.value)} /></FormField>}
            {authType !== 'none' && (
              <FormField label={authType === 'bearer' ? 'Token' : 'Giá trị header'}
                hint="Được mã hóa khi lưu và không hiển thị lại." note={server?.has_secret && server.auth_type === authType ? `Đã lưu (kết thúc …${server.auth_hint ?? '****'}). Để trống để giữ nguyên.` : undefined}>
                <Input type="password" autoComplete="off" maxLength={2000} value={secret} placeholder={server?.has_secret && server.auth_type === authType ? '••••••••' : ''} onChange={(event) => setSecret(event.target.value)} />
              </FormField>
            )}
          </div>
        </Panel>
      )}

      <Panel title={`Tool (đã chọn ${pickedCount}/${options.length})`}
        info={builtin
          ? 'Tick tool mà các Agent dùng MCP server này được phép gọi. Cách chạy của từng tool (khách xác nhận, nhân viên duyệt…) cố định trong hệ thống.'
          : 'Bấm “Lấy danh sách tool” để kết nối và tải tool của server (chưa lưu gì), tick các tool cần dùng rồi bấm lưu. Agent chọn MCP server này sẽ dùng tất cả tool đã tick. Tool có thể gây thay đổi nên đánh dấu “cần nhân viên duyệt”: Agent dừng chờ duyệt ở trang Phê duyệt trước khi gọi.'}
        action={builtin ? <Badge color="gray" size="sm">Tool có sẵn của hệ thống</Badge> : (
          <Button type="button" variant="outline" size="sm" disabled={fetching || !url.trim()} onClick={() => void fetchTools()}>{fetching ? 'Đang lấy…' : 'Lấy danh sách tool'}</Button>
        )}>
        <div className="space-y-3 pb-5">
          {fetchError && <p className="mx-5 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-600 sm:mx-6 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">{fetchError}</p>}
          {stale && <p className="mx-5 rounded-xl border border-amber-300 bg-amber-50 p-3 text-theme-xs text-amber-900 sm:mx-6 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">Bạn đã đổi địa chỉ hoặc xác thực sau lần lấy tool trước. Bấm “Lấy danh sách tool” lại để chắc chắn danh sách còn đúng; khi lưu hệ thống cũng kiểm tra lại.</p>}
          {dropped.length > 0 && <p className="mx-5 rounded-xl border border-amber-300 bg-amber-50 p-3 text-theme-xs text-amber-900 sm:mx-6 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">Các tool đã chọn không còn trên server nên bị bỏ chọn: {dropped.join(', ')}.</p>}

          {options.length === 0
            ? <p className="px-5 text-sm text-gray-500 sm:px-6 dark:text-gray-400">{builtin ? 'Không có tool.' : 'Chưa có danh sách tool. Nhập URL (và xác thực) rồi bấm “Lấy danh sách tool”.'}</p>
            : (
              <>
                <div className="flex flex-wrap items-center gap-2 px-5 sm:px-6">
                  <Button type="button" size="xs" variant="outline" onClick={selectAll}>Chọn tất cả</Button>
                  <Button type="button" size="xs" variant="ghost" onClick={selectNone}>Bỏ chọn</Button>
                  {!builtin && server?.last_checked_at && tools === server.tools_cache && <span className="text-theme-xs text-gray-500 dark:text-gray-400">Danh sách từ lần kiểm tra {formatChecked(server.last_checked_at)}</span>}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px]">
                    <thead className="border-y border-gray-100 dark:border-white/5"><tr><th className="w-12 px-5 py-3" /><th className={th}>Tên tool</th><th className={th}>{builtin ? 'Cách chạy' : 'Mô tả'}</th>{!builtin && <th className={th}>Tính chất</th>}{!builtin && <th className={th}>Cần nhân viên duyệt</th>}</tr></thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                      {builtin
                        ? builtinTools.map((tool) => (
                          <tr key={tool.name}>
                            <td className="px-5 py-3"><input type="checkbox" aria-label={`Dùng ${tool.name}`} className="size-4 accent-brand-500" checked={Boolean(picked[tool.name])} onChange={() => toggle(tool)} /></td>
                            <td className={td}><code className="text-xs">{tool.name}</code></td>
                            <td className={td}><Badge color={kindBadge[tool.kind].color} size="sm">{kindBadge[tool.kind].label}</Badge></td>
                          </tr>
                        ))
                        : tools.map((tool) => (
                          <tr key={tool.name}>
                            <td className="px-5 py-3"><input type="checkbox" aria-label={`Dùng ${tool.name}`} className="size-4 accent-brand-500" checked={Boolean(picked[tool.name])} onChange={() => toggle(tool, tool)} /></td>
                            <td className={td}><code className="text-xs">{tool.name}</code></td>
                            <td className={`${td} max-w-md`}><span className="line-clamp-2">{tool.description || '—'}</span></td>
                            <td className={td}>{tool.destructive ? <Badge color="error" size="sm">Có thể gây thay đổi</Badge> : tool.readOnly ? <Badge color="gray" size="sm">Chỉ đọc</Badge> : tool.readOnly === false ? <Badge color="warning" size="sm">Ghi dữ liệu</Badge> : <Badge color="gray" size="sm">Không rõ</Badge>}</td>
                            <td className={td}>
                              <label className={`flex items-center gap-2 text-theme-xs ${picked[tool.name] ? '' : 'text-gray-300 dark:text-gray-600'}`}>
                                <input type="checkbox" className="size-4 accent-brand-500" disabled={!picked[tool.name]} checked={picked[tool.name]?.requiresApproval ?? false}
                                  onChange={(event) => setPicked((current) => ({ ...current, [tool.name]: { requiresApproval: event.target.checked } }))} />Cần duyệt
                              </label>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
        </div>
      </Panel>

      {server && server.agents.length > 0 && (
        <Panel title="Agent đang dùng server này" info="Đổi lựa chọn tool ở đây áp dụng ngay cho các Agent này.">
          <div className="space-y-2 px-5 pb-5 sm:px-6">
            <span className="inline-flex flex-wrap gap-1.5">{server.agents.map((agent) => <Link key={agent.id} href={`/admin/agents/${agent.id}`}><Badge color="primary" size="sm">{agent.name}</Badge></Link>)}</span>
          </div>
        </Panel>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={saving || fetching}>{saving ? 'Đang lưu…' : server ? 'Lưu thay đổi' : 'Thêm server'}</Button>
        {server && !builtin && <Button type="button" variant="outline" size="sm" disabled={saving || fetching} onClick={() => void checkConnection()}>Kiểm tra kết nối</Button>}
        <Link href="/admin/mcp-servers"><Button type="button" variant="ghost" size="sm">Quay lại</Button></Link>
      </div>
      {builtin && <p className="text-theme-sm text-gray-500 dark:text-gray-400">MCP server có sẵn của hệ thống: chỉ chọn được tool. Không sửa, tắt hoặc xóa được; địa chỉ lấy từ biến môi trường MCP_URL.</p>}
      {!builtin && !server && <p className="text-theme-xs text-gray-500 dark:text-gray-400">Chưa chọn tool nào cũng lưu được, nhưng Agent chỉ chọn được server đã có ít nhất một tool.</p>}
    </form>
  );
}
