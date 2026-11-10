'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useConfirm, useToast } from '@/components/admin/feedback';
import { FormField, NativeSelect } from '@/components/admin/form';
import { MultiSelect } from '@/components/admin/multi-select';
import { PromptEditor } from '@/components/admin/prompt-editor';
import { Panel } from '@/components/admin/page-header';
import { Badge } from '@/components/admin-ui/badge';
import { Button } from '@/components/admin-ui/button';
import { Input } from '@/components/admin-ui/input';
import { Switch } from '@/components/admin-ui/switch';
import { Textarea } from '@/components/admin-ui/textarea';
import { callApi } from '@/lib/client-api';
import { slugify } from '@/lib/slug';
import type { ModelOption } from '@/features/ai/models';
import { promptToolsSignature } from '@/features/ai/prompt-signature';

export type AgentFormValues = {
  id?: string; name: string; slug: string; description: string; instructions: string; model: string; temperature: number; maxTokens: number; maxSteps: number; maxToolCalls: number;
  /** null = follow the system default. */
  summaryEnabled: boolean | null; summarizeAfterMessages: number | null; keepRecentMessages: number | null;
  /** Tools/scopes the prompt was generated for; null = written by hand. */
  promptToolsSignature: string | null;
  isActive: boolean; isDefault: boolean; scopeIds: string[]; mcpServerIds: string[]; threadCount: number;
};
export type HistoryDefaults = { summaryEnabled: boolean; summarizeAfterMessages: number; keepRecentMessages: number };
export type ScopeOption = { id: string; name: string; toolName: string; description: string };
/** An MCP server an agent can use: all its ticked tools come with it. */
export type ServerOption = { id: string; name: string; slug: string; isBuiltin: boolean; enabled: boolean; tools: { name: string; requiresApproval: boolean }[] };

const toggle = <T,>(list: T[], item: T) => list.includes(item) ? list.filter((value) => value !== item) : [...list, item];

/** Create or edit an agent: instructions, model and limits, knowledge scopes, built-in tools (rules fixed in code) and external MCP tools. */
export function AgentForm({ initial, models, scopes, servers, historyDefaults }: { initial: AgentFormValues; models: ModelOption[]; scopes: ScopeOption[]; servers: ServerOption[]; historyDefaults: HistoryDefaults }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [values, setValues] = useState(initial);
  const [slugEdited, setSlugEdited] = useState(Boolean(initial.id));
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const set = <K extends keyof AgentFormValues>(key: K, value: AgentFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const summaryOn = values.summaryEnabled ?? historyDefaults.summaryEnabled;
  const currentModel = models.find((model) => model.id === values.model || model.aliases?.includes(values.model));
  // Same description of the tools as the server stores when it writes a prompt: lets the form say when the tools changed since.
  const pickedServers = servers.filter((server) => server.enabled && values.mcpServerIds.includes(server.id));
  const currentSignature = promptToolsSignature({
    builtin: pickedServers.filter((server) => server.isBuiltin).flatMap((server) => server.tools.map((tool) => tool.name)),
    scopes: scopes.filter((scope) => values.scopeIds.includes(scope.id)).map((scope) => scope.toolName),
    externals: pickedServers.filter((server) => !server.isBuiltin).flatMap((server) => server.tools.map((tool) => ({ serverSlug: server.slug, toolName: tool.name, requiresApproval: tool.requiresApproval }))),
  });
  const promptOutdated = values.promptToolsSignature !== null && values.promptToolsSignature !== currentSignature;
  const modelOptions = currentModel ? models : [{ id: values.model, label: values.model }, ...models];

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const payload = {
      name: values.name, slug: values.slug, description: values.description, instructions: values.instructions, promptToolsSignature: values.promptToolsSignature, model: values.model, temperature: Number(values.temperature), maxTokens: Number(values.maxTokens),
      maxSteps: Number(values.maxSteps), maxToolCalls: Number(values.maxToolCalls), summaryEnabled: values.summaryEnabled, summarizeAfterMessages: values.summarizeAfterMessages, keepRecentMessages: values.keepRecentMessages, isActive: values.isActive, scopeIds: values.scopeIds, mcpServerIds: values.mcpServerIds,
    };
    const result = values.id
      ? await callApi(`/api/admin/agents/${values.id}`, { method: 'PUT', json: payload })
      : await callApi<{ id: string }>('/api/admin/agents', { json: payload });
    setBusy(false);
    if (!result.ok) { toast('error', result.error); return; }
    toast('success', values.id ? 'Đã lưu Agent. Thay đổi có hiệu lực ngay với các lượt chat tiếp theo.' : 'Đã tạo Agent.');
    if (values.id) router.refresh(); else router.push(`/admin/agents/${(result.data as { id: string }).id}`);
  }

  async function generate() {
    if (values.instructions.trim().length >= 20 && values.promptToolsSignature === null && !(await confirm({
      title: 'Tạo lại hướng dẫn bằng AI?', message: 'Hướng dẫn hiện tại sẽ được AI cải thiện và thay vào ô bên dưới. Bạn vẫn xem và sửa được trước khi lưu; chỉ khi bấm “Lưu thay đổi” mới áp dụng.', confirmLabel: 'Tạo lại',
    }))) return;
    setGenerating(true);
    const result = await callApi<{ instructions: string; signature: string }>('/api/admin/agents/generate-prompt', {
      json: { name: values.name, description: values.description, model: values.model, scopeIds: values.scopeIds, mcpServerIds: values.mcpServerIds, currentInstructions: values.instructions },
    });
    setGenerating(false);
    if (!result.ok) { toast('error', result.error); return; }
    setValues((current) => ({ ...current, instructions: result.data.instructions, promptToolsSignature: result.data.signature }));
    toast('success', 'AI đã viết hướng dẫn. Hãy đọc lại, chỉnh nếu cần rồi bấm Lưu thay đổi.');
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
    <form onSubmit={save} className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_460px] 2xl:grid-cols-[minmax(0,1fr)_540px]">
      <div className="min-w-0 space-y-5">
      <Panel title="Thông tin chung" action={
        <label className="flex items-center gap-2.5">
          <Switch checked={values.isActive} disabled={values.isDefault} onCheckedChange={(checked) => set('isActive', checked)} aria-label="Đang bật" />
          <span className="text-sm text-gray-700 dark:text-gray-300">{values.isActive ? 'Đang bật' : 'Đang tắt'}{values.isDefault && <span className="ml-2 text-theme-xs text-gray-500">Agent mặc định luôn bật.</span>}</span>
        </label>}>
        <div className="grid gap-4 px-5 pb-5 sm:px-6 sm:grid-cols-2">
          <FormField label="Tên Agent"><Input required minLength={2} maxLength={80} value={values.name} placeholder="Trợ lý tư vấn"
            onChange={(event) => { set('name', event.target.value); if (!slugEdited) set('slug', slugify(event.target.value)); }} /></FormField>
          <FormField label="Mã (slug)" hint="Chữ thường, số, dấu gạch ngang."><Input required maxLength={49} className="font-mono" value={values.slug} onChange={(event) => { set('slug', event.target.value); setSlugEdited(true); }} /></FormField>
          <FormField label="Mô tả Agent" className="sm:col-span-2" hint="Vai trò, thông tin cửa hàng (tên, địa chỉ, giờ mở cửa, hotline), giọng điệu, cách bán hàng hay quy tắc riêng. AI dùng phần này, cùng các tool và scope bên dưới, để viết prompt.">
            <Textarea rows={4} maxLength={2000} value={values.description} onChange={(event) => set('description', event.target.value)} placeholder="Ví dụ: Tư vấn viên bán hàng thân thiện, xưng “mình – bạn”, chủ động gợi ý món phối cùng; tra đơn và đổi trả thì hướng dẫn khách gọi hotline 0236…" />
          </FormField>
        </div>
      </Panel>

      <Panel title="Hướng dẫn của Agent" info="Đây là toàn bộ prompt của Agent; hệ thống không thêm quy tắc nào khác, chỉ thêm mỗi lượt một khối dữ kiện (ngày hôm nay, source_id hợp lệ, thông tin khách đã lưu). Xác minh chủ đơn, nút Xác nhận của khách, nhân viên duyệt và kiểm tra số liệu luôn do hệ thống thực hiện, dù hướng dẫn viết gì. AI viết bằng model chọn ở mục Model; kết quả chỉ áp dụng khi bạn bấm Lưu thay đổi." action={
        <Button type="button" variant="outline" size="sm" disabled={generating || busy || !values.model} onClick={() => void generate()}>{generating ? 'AI đang viết…' : values.instructions.trim().length >= 20 ? 'Tạo lại bằng AI' : 'Tạo bằng AI'}</Button>}>
        <div className="space-y-3 px-5 pb-5 sm:px-6">
          {promptOutdated && <p className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-theme-xs text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-400">Tool hoặc Knowledge scope đã thay đổi kể từ lần AI viết hướng dẫn này. Bấm “Tạo lại bằng AI” để hướng dẫn khớp với những gì Agent đang có.</p>}
          <PromptEditor value={values.instructions} onChange={(next) => set('instructions', next)} maxLength={12000} required
            placeholder="Bấm “Tạo bằng AI” để AI viết từ mô tả, tool và scope của Agent, hoặc tự viết ở đây. Dùng ## cho tiêu đề mục, - cho gạch đầu dòng, **chữ** để in đậm." />
          <p className="text-theme-xs text-gray-500 dark:text-gray-400">{values.instructions.length}/12000</p>
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

      <Panel title={`MCP Server (${values.mcpServerIds.length})`} info="Chọn các MCP server Agent được dùng. Agent dùng tất cả tool đã tick ở mỗi server (tick tool tại trang MCP Server). Tool của server ngoài không biết khách là ai và kết quả của chúng được xem là dữ liệu không tin cậy.">
        <div className="space-y-4 px-5 pb-5 sm:px-6">
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

      </div>

      <div className="space-y-5">
        <Panel title="Model">
          <div className="grid gap-4 px-5 pb-5 sm:px-6 sm:grid-cols-2">
            <FormField label="Model" className="sm:col-span-2"><NativeSelect value={currentModel?.id ?? values.model} onChange={(event) => set('model', event.target.value)}>{modelOptions.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}</NativeSelect></FormField>
            <FormField label="Temperature" hint="0 ổn định · 2 sáng tạo. Nên 0–0.5."><Input type="number" step="0.1" min={0} max={2} value={values.temperature} onChange={(event) => set('temperature', Number(event.target.value))} /></FormField>
            <FormField label="Max Tokens" hint="Token tối đa mỗi câu trả lời."><Input type="number" min={1} max={32768} value={values.maxTokens} onChange={(event) => set('maxTokens', Number(event.target.value))} /></FormField>
          </div>
        </Panel>

        <Panel title="Giới hạn mỗi lượt">
          <div className="grid gap-4 px-5 pb-5 sm:px-6 sm:grid-cols-2">
            <FormField label="Lần gọi model" hint="Tối đa, tránh vòng lặp vô hạn."><Input type="number" min={1} max={20} value={values.maxSteps} onChange={(event) => set('maxSteps', Number(event.target.value))} /></FormField>
            <FormField label="Lần gọi tool" hint="Tối đa tool call."><Input type="number" min={1} max={20} value={values.maxToolCalls} onChange={(event) => set('maxToolCalls', Number(event.target.value))} /></FormField>
          </div>
        </Panel>

        <Panel title="Lịch sử hội thoại">
          <div className="grid gap-4 px-5 pb-5 sm:px-6 sm:grid-cols-2">
            <FormField label="Tóm tắt hội thoại dài" className="sm:col-span-2" hint="Gộp phần cũ thành đoạn ngắn đã che dữ liệu cá nhân. Không dùng làm giá, tồn kho hay trạng thái đơn.">
              <NativeSelect value={values.summaryEnabled === null ? '' : String(values.summaryEnabled)} onChange={(event) => set('summaryEnabled', event.target.value === '' ? null : event.target.value === 'true')}>
                <option value="">Theo hệ thống ({historyDefaults.summaryEnabled ? 'bật' : 'tắt'})</option>
                <option value="true">Bật</option>
                <option value="false">Tắt</option>
              </NativeSelect>
            </FormField>
            <FormField label="Tóm tắt khi vượt" hint={`Tin nhắn, 8–200. Trống = hệ thống (${historyDefaults.summarizeAfterMessages}).`}>
              <Input type="number" min={8} max={200} disabled={!summaryOn} value={values.summarizeAfterMessages ?? ''} placeholder={String(historyDefaults.summarizeAfterMessages)} onChange={(event) => set('summarizeAfterMessages', event.target.value === '' ? null : Number(event.target.value))} />
            </FormField>
            <FormField label="Giữ nguyên văn" hint={`Tin nhắn gần nhất, 4–100. Trống = hệ thống (${historyDefaults.keepRecentMessages}). Nhiều hơn tốn token hơn.`}>
              <Input type="number" min={4} max={100} disabled={!summaryOn} value={values.keepRecentMessages ?? ''} placeholder={String(historyDefaults.keepRecentMessages)} onChange={(event) => set('keepRecentMessages', event.target.value === '' ? null : Number(event.target.value))} />
            </FormField>
          </div>
        </Panel>
      </div>

      <div className="flex flex-wrap items-center gap-2 xl:col-span-2">
        <Button type="submit" disabled={busy}>{values.id ? 'Lưu thay đổi' : 'Tạo Agent'}</Button>
        <Link href="/admin/agents"><Button type="button" variant="ghost">Quay lại</Button></Link>
        {values.id && !values.isDefault && values.isActive && <Button type="button" variant="outline" disabled={busy} onClick={() => void makeDefault()}>Đặt làm mặc định</Button>}
        {values.id && !values.isDefault && <Button type="button" variant="ghost" className="ml-auto text-red-500 hover:text-red-600" disabled={busy} onClick={() => void remove()}>{values.threadCount > 0 ? 'Lưu trữ Agent' : 'Xóa Agent'}</Button>}
      </div>
    </form>
  );
}
