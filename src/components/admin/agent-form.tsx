'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useConfirm, useToast } from '@/components/admin/feedback';
import { FormField, NativeSelect } from '@/components/admin/form';
import { MultiSelect } from '@/components/admin/multi-select';
import { Panel } from '@/components/admin/page-header';
import { Badge } from '@/components/admin-ui/badge';
import { Button } from '@/components/admin-ui/button';
import { Input } from '@/components/admin-ui/input';
import { Switch } from '@/components/admin-ui/switch';
import { Textarea } from '@/components/admin-ui/textarea';
import { callApi } from '@/lib/client-api';
import { slugify } from '@/lib/slug';

export type AgentFormValues = {
  id?: string; name: string; slug: string; description: string; instructions: string; model: string; temperature: number; maxSteps: number; maxToolCalls: number;
  isActive: boolean; isDefault: boolean; scopeIds: string[]; mcpServerIds: string[]; threadCount: number;
};
export type ScopeOption = { id: string; name: string; toolName: string; description: string };
/** An MCP server an agent can use: all its ticked tools come with it. */
export type ServerOption = { id: string; name: string; slug: string; isBuiltin: boolean; enabled: boolean; tools: { name: string; requiresApproval: boolean }[] };

const toggle = <T,>(list: T[], item: T) => list.includes(item) ? list.filter((value) => value !== item) : [...list, item];

/** Create or edit an agent: instructions, model and limits, knowledge scopes, built-in tools (rules fixed in code) and external MCP tools. */
export function AgentForm({ initial, models, scopes, servers }: { initial: AgentFormValues; models: string[]; scopes: ScopeOption[]; servers: ServerOption[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [values, setValues] = useState(initial);
  const [slugEdited, setSlugEdited] = useState(Boolean(initial.id));
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof AgentFormValues>(key: K, value: AgentFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const modelOptions = models.includes(values.model) ? models : [values.model, ...models];

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const payload = {
      name: values.name, slug: values.slug, description: values.description, instructions: values.instructions, model: values.model, temperature: Number(values.temperature),
      maxSteps: Number(values.maxSteps), maxToolCalls: Number(values.maxToolCalls), isActive: values.isActive, scopeIds: values.scopeIds, mcpServerIds: values.mcpServerIds,
    };
    const result = values.id
      ? await callApi(`/api/admin/agents/${values.id}`, { method: 'PUT', json: payload })
      : await callApi<{ id: string }>('/api/admin/agents', { json: payload });
    setBusy(false);
    if (!result.ok) { toast('error', result.error); return; }
    toast('success', values.id ? 'Đã lưu Agent. Thay đổi có hiệu lực ngay với các lượt chat tiếp theo.' : 'Đã tạo Agent.');
    if (values.id) router.refresh(); else router.push(`/admin/agents/${(result.data as { id: string }).id}`);
  }

  async function makeDefault() {
    if (!values.id) return;
    if (!(await confirm({ title: `Đặt “${values.name}” làm Agent mặc định?`, message: 'Agent này sẽ trả lời mọi cuộc chat mới trên website. Các cuộc chat đang diễn ra giữ Agent cũ.', confirmLabel: 'Đặt làm mặc định' }))) return;
    setBusy(true);
    const result = await callApi(`/api/admin/agents/${values.id}/default`, { method: 'POST' });
    setBusy(false);
    if (!result.ok) { toast('error', result.error); return; }
    toast('success', 'Đã đặt làm Agent mặc định.');
    router.refresh();
  }

  async function remove() {
    if (!values.id) return;
    const hasThreads = values.threadCount > 0;
    if (!(await confirm({
      title: hasThreads ? `Lưu trữ “${values.name}”?` : `Xóa “${values.name}”?`,
      message: hasThreads ? `Agent đã có ${values.threadCount} cuộc chat nên sẽ được lưu trữ: không dùng cho chat mới, các cuộc chat cũ chuyển sang Agent mặc định.` : 'Thao tác này không thể hoàn tác.',
      confirmLabel: hasThreads ? 'Lưu trữ' : 'Xóa Agent', danger: true,
    }))) return;
    setBusy(true);
    const result = await callApi<{ outcome: string }>(`/api/admin/agents/${values.id}`, { method: 'DELETE' });
    setBusy(false);
    if (!result.ok) { toast('error', result.error); return; }
    toast('success', result.data.outcome === 'archived' ? 'Đã lưu trữ Agent.' : 'Đã xóa Agent.');
    router.push('/admin/agents');
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <Panel title="Thông tin và cấu hình">
        <div className="grid gap-5 px-5 pb-5 sm:px-6 lg:grid-cols-2">
          <FormField label="Tên Agent"><Input required minLength={2} maxLength={80} value={values.name} placeholder="Trợ lý tư vấn"
            onChange={(event) => { set('name', event.target.value); if (!slugEdited) set('slug', slugify(event.target.value)); }} /></FormField>
          <FormField label="Mã (slug)" hint="Chữ thường, số, dấu gạch ngang."><Input required maxLength={49} className="font-mono" value={values.slug} onChange={(event) => { set('slug', event.target.value); setSlugEdited(true); }} /></FormField>
          <FormField className="lg:col-span-2" label="Mô tả (tuỳ chọn)"><Input maxLength={300} value={values.description} onChange={(event) => set('description', event.target.value)} /></FormField>
          <FormField label="Model"><NativeSelect value={values.model} onChange={(event) => set('model', event.target.value)}>{modelOptions.map((model) => <option key={model} value={model}>{model}</option>)}</NativeSelect></FormField>
          <FormField label="Temperature" hint="0 = ổn định, 2 = sáng tạo. Nên để thấp (0–0.5) cho tư vấn bán hàng."><Input type="number" step="0.1" min={0} max={2} value={values.temperature} onChange={(event) => set('temperature', Number(event.target.value))} /></FormField>
          <FormField label="Số lần gọi model tối đa mỗi lượt" hint="Giới hạn vòng lặp để không chạy vô hạn."><Input type="number" min={1} max={20} value={values.maxSteps} onChange={(event) => set('maxSteps', Number(event.target.value))} /></FormField>
          <FormField label="Số tool call tối đa mỗi lượt"><Input type="number" min={1} max={20} value={values.maxToolCalls} onChange={(event) => set('maxToolCalls', Number(event.target.value))} /></FormField>
          <label className="flex items-center gap-3 lg:col-span-2">
            <Switch checked={values.isActive} disabled={values.isDefault} onCheckedChange={(checked) => set('isActive', checked)} aria-label="Đang bật" />
            <span className="text-sm text-gray-700 dark:text-gray-300">Đang bật{values.isDefault && <span className="ml-2 text-theme-xs text-gray-500">Agent mặc định luôn bật.</span>}</span>
          </label>
        </div>
      </Panel>

      <Panel title="Hướng dẫn của Agent">
        <div className="space-y-2 px-5 pb-5 sm:px-6">
          <Textarea required minLength={20} maxLength={6000} rows={8} value={values.instructions} onChange={(event) => set('instructions', event.target.value)} placeholder="Bạn là trợ lý của cửa hàng…" />
          <p className="text-theme-xs text-gray-500 dark:text-gray-400">{values.instructions.length}/6000. Mô tả vai trò, giọng điệu, phạm vi. Phần này được nối trước “core an toàn” của hệ thống (quy trình tra đơn, đổi/trả, đặt hàng, không bịa số liệu, định dạng câu trả lời), core không sửa được. Không dùng ký tự {'{{'} hoặc {'}}'}.</p>
        </div>
      </Panel>

      <Panel title={`Knowledge scope (${values.scopeIds.length})`}>
        <div className="px-5 pb-5 sm:px-6">
          {scopes.length === 0
            ? <p className="text-sm text-gray-500 dark:text-gray-400">Chưa có scope. <Link className="text-brand-500 hover:underline" href="/admin/knowledge/scopes/new">Tạo scope</Link> để Agent tra cứu được tài liệu.</p>
            : <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-white/5 dark:border-gray-800">{scopes.map((scope) => (
              <li key={scope.id}><label className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/2">
                <input type="checkbox" className="mt-1 size-4 accent-brand-500" checked={values.scopeIds.includes(scope.id)} onChange={() => set('scopeIds', toggle(values.scopeIds, scope.id))} />
                <span className="min-w-0 flex-1"><span className="text-sm font-medium text-gray-800 dark:text-white/90">{scope.name}</span> <code className="ml-1 text-xs text-gray-500">{scope.toolName}</code>
                  <span className="mt-0.5 line-clamp-2 block text-theme-xs text-gray-500 dark:text-gray-400">{scope.description}</span></span>
              </label></li>
            ))}</ul>}
        </div>
      </Panel>

      <Panel title={`MCP Server (${values.mcpServerIds.length})`}>
        <div className="space-y-4 px-5 pb-5 sm:px-6">
          <p className="text-theme-xs text-gray-500 dark:text-gray-400">Chọn các MCP server Agent được dùng. Agent dùng tất cả tool đã tick ở mỗi server (tick tool tại trang <Link className="text-brand-500 hover:underline" href="/admin/mcp-servers">MCP Server</Link>). Tool của server ngoài không biết khách là ai và kết quả của chúng được xem là dữ liệu không tin cậy.</p>
          <MultiSelect label="Chọn MCP Server" placeholder="Chọn MCP Server…" emptyText="Chưa có MCP server nào." value={values.mcpServerIds} onChange={(next) => set('mcpServerIds', next)}
            options={servers.map((server) => ({
              value: server.id, label: server.name,
              disabled: !server.enabled || server.tools.length === 0,
              description: !server.enabled ? 'Đang tắt' : server.tools.length === 0 ? 'Chưa chọn tool nào: mở MCP Server, lấy danh sách tool và tick tool cần dùng' : `${server.isBuiltin ? 'Có sẵn · ' : ''}${server.tools.length} tool đã chọn`,
            }))} />
          {values.mcpServerIds.length > 0 && (
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-white/5 dark:border-gray-800">
              {values.mcpServerIds.map((id) => servers.find((server) => server.id === id)).filter((server) => server !== undefined).map((server) => (
                <li key={server.id} className="px-4 py-3">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-gray-800 dark:text-white/90">{server.name}
                    {server.isBuiltin && <Badge color="primary" size="sm">Có sẵn</Badge>}
                    {!server.enabled && <Badge color="gray" size="sm">Đang tắt</Badge>}
                    <Link href={`/admin/mcp-servers/${server.id}`} className="ml-auto text-theme-xs font-normal text-brand-500 hover:underline">Sửa tool</Link>
                  </p>
                  <p className="mt-1.5 flex flex-wrap gap-1.5">{server.tools.length === 0 ? <span className="text-theme-xs text-gray-500">Chưa chọn tool.</span> : server.tools.map((tool) => (
                    <Badge key={tool.name} color={tool.requiresApproval ? 'warning' : 'gray'} size="sm">{tool.name}{tool.requiresApproval ? ' · cần duyệt' : ''}</Badge>
                  ))}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="lg" disabled={busy}>{values.id ? 'Lưu thay đổi' : 'Tạo Agent'}</Button>
        <Link href="/admin/agents"><Button type="button" variant="ghost" size="lg">Quay lại</Button></Link>
        {values.id && !values.isDefault && values.isActive && <Button type="button" variant="outline" size="lg" disabled={busy} onClick={() => void makeDefault()}>Đặt làm mặc định</Button>}
        {values.id && !values.isDefault && <Button type="button" variant="ghost" size="lg" className="ml-auto text-red-500 hover:text-red-600" disabled={busy} onClick={() => void remove()}>{values.threadCount > 0 ? 'Lưu trữ Agent' : 'Xóa Agent'}</Button>}
      </div>
    </form>
  );
}
