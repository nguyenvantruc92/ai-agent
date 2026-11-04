'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useConfirm, useToast } from '@/components/admin/feedback';
import { FormField } from '@/components/admin/form';
import { Panel } from '@/components/admin/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/admin-ui/badge';
import { Button } from '@/components/admin-ui/button';
import { Input } from '@/components/admin-ui/input';
import { Switch } from '@/components/admin-ui/switch';
import { Textarea } from '@/components/admin-ui/textarea';
import { callApi } from '@/lib/client-api';
import { slugify } from '@/lib/slug';

export type ScopeFormScope = { id: string; name: string; tool_name: string; tool_description: string; include_system_policy: boolean; documentIds: string[]; agents: { id: string; name: string }[] };
type DocumentOption = { id: string; original_filename: string; status: string };
type Hit = { source_id: string; title: string; similarity: number };

/** "Chính sách đổi trả" -> "search_chinh_sach_doi_tra" (limited to what the API accepts). */
const suggestToolName = (name: string) => `search_${slugify(name).replace(/-/g, '_')}`.replace(/_+/g, '_').slice(0, 41).replace(/_$/, '');

export function ScopeForm({ scope, documents }: { scope?: ScopeFormScope; documents: DocumentOption[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [name, setName] = useState(scope?.name ?? '');
  const [toolName, setToolName] = useState(scope?.tool_name ?? '');
  const [toolNameEdited, setToolNameEdited] = useState(Boolean(scope));
  const [description, setDescription] = useState(scope?.tool_description ?? '');
  const [documentIds, setDocumentIds] = useState<string[]>(scope?.documentIds ?? []);
  const [includeSystemPolicy, setIncludeSystemPolicy] = useState(scope?.include_system_policy ?? false);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState('');
  const [hits, setHits] = useState<Hit[]>();

  const toggle = (id: string) => setDocumentIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const payload = { name, toolName, description, documentIds, includeSystemPolicy };
    const result = scope
      ? await callApi(`/api/admin/knowledge-scopes/${scope.id}`, { method: 'PUT', json: payload })
      : await callApi<{ id: string }>('/api/admin/knowledge-scopes', { json: payload });
    setBusy(false);
    if (!result.ok) { toast('error', result.error); return; }
    toast('success', scope ? 'Đã lưu scope.' : 'Đã tạo scope.');
    if (scope) router.refresh(); else router.push(`/admin/knowledge/scopes/${(result.data as { id: string }).id}`);
  }

  async function remove() {
    if (!scope) return;
    if (!(await confirm({ title: `Xóa scope “${scope.name}”?`, message: 'Các file không bị xóa, chỉ gỡ khỏi scope này.', confirmLabel: 'Xóa scope', danger: true }))) return;
    setBusy(true);
    const result = await callApi(`/api/admin/knowledge-scopes/${scope.id}`, { method: 'DELETE' });
    setBusy(false);
    if (!result.ok) { toast('error', result.error); return; }
    toast('success', 'Đã xóa scope.');
    router.push('/admin/knowledge');
  }

  async function test(event: FormEvent) {
    event.preventDefault();
    if (!scope || !question.trim()) return;
    const result = await callApi<{ chunks: Hit[] }>(`/api/admin/knowledge-scopes/${scope.id}/test`, { json: { message: question } });
    if (!result.ok) { toast('error', result.error); return; }
    setHits(result.data.chunks);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={save} className="space-y-6">
        <Panel title="Thông tin scope">
          <div className="grid gap-5 px-5 pb-5 sm:px-6 lg:grid-cols-2">
            <FormField label="Tên scope" hint="Tên hiển thị cho admin, ví dụ “Chính sách”.">
              <Input required maxLength={80} value={name} placeholder="Chính sách đổi trả"
                onChange={(event) => { setName(event.target.value); if (!toolNameEdited) setToolName(suggestToolName(event.target.value)); }} />
            </FormField>
            <FormField label="Tên tool" hint="Model thấy tên này như một tool. Chữ thường, số, dấu gạch dưới; ví dụ search_policy.">
              <Input required maxLength={41} value={toolName} placeholder="search_policy" className="font-mono"
                onChange={(event) => { setToolName(event.target.value); setToolNameEdited(true); }} />
            </FormField>
            <FormField className="lg:col-span-2" label="Mô tả tool" hint={`Model đọc mô tả này để quyết định khi nào gọi tool. Nên nêu rõ loại câu hỏi nên và không nên dùng. (${description.length}/1000)`}>
              <Textarea required minLength={20} maxLength={1000} rows={4} value={description} onChange={(event) => setDescription(event.target.value)}
                placeholder="Tìm chính sách đổi size, trả hàng, hoàn tiền. Dùng khi khách hỏi quy định hoặc điều kiện; không dùng để tìm sản phẩm." />
            </FormField>
          </div>
        </Panel>

        <Panel title={`File thuộc scope (${documentIds.length})`}>
          <div className="space-y-4 px-5 pb-5 sm:px-6">
            {documents.length === 0
              ? <p className="text-sm text-gray-500 dark:text-gray-400">Chưa có tài liệu nào. Upload PDF ở tab <Link className="text-brand-500 hover:underline" href="/admin/knowledge?tab=files">Tài liệu</Link> rồi quay lại đây.</p>
              : <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-white/5 dark:border-gray-800">{documents.map((document) => (
                <li key={document.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/2">
                    <input type="checkbox" className="size-4 accent-brand-500" checked={documentIds.includes(document.id)} onChange={() => toggle(document.id)} />
                    <span className="flex-1 text-sm text-gray-800 dark:text-white/90">{document.original_filename}</span>
                    <StatusBadge status={document.status} />
                  </label>
                </li>
              ))}</ul>}
            <label className="flex items-start gap-3">
              <Switch checked={includeSystemPolicy} onCheckedChange={setIncludeSystemPolicy} aria-label="Gồm chính sách giao hàng của hệ thống" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Gồm chính sách giao hàng hiện hành
                <span className="block text-theme-xs text-gray-500 dark:text-gray-400">Phí giao hàng và ngưỡng miễn phí do hệ thống tự sinh từ Cài đặt (không phải file), luôn đúng với giá trị đang áp dụng.</span>
              </span>
            </label>
            <p className="text-theme-xs text-gray-500 dark:text-gray-400">Sản phẩm không nằm trong scope: AI tìm sản phẩm bằng tool riêng và luôn lấy giá, tồn kho từ cơ sở dữ liệu.</p>
          </div>
        </Panel>

        {scope && (
          <Panel title="Agent đang dùng scope này">
            <div className="px-5 pb-5 sm:px-6">
              {scope.agents.length ? <span className="inline-flex flex-wrap gap-1.5">{scope.agents.map((agent) => <Link key={agent.id} href={`/admin/agents/${agent.id}`}><Badge color="primary" size="sm">{agent.name}</Badge></Link>)}</span>
                : <p className="text-sm text-gray-500 dark:text-gray-400">Chưa có Agent nào dùng scope này nên AI chưa gọi được tool này.</p>}
            </div>
          </Panel>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="lg" disabled={busy}>{scope ? 'Lưu thay đổi' : 'Tạo scope'}</Button>
          <Link href="/admin/knowledge"><Button type="button" variant="ghost" size="lg">Quay lại</Button></Link>
          {scope && <Button type="button" variant="ghost" size="lg" className="ml-auto text-red-500 hover:text-red-600" disabled={busy} onClick={() => void remove()}>Xóa scope</Button>}
        </div>
      </form>

      {scope && (
        <Panel title="Thử truy xuất trong scope">
          <div className="space-y-4 px-5 pb-5 sm:px-6">
            <p className="text-theme-xs text-gray-500 dark:text-gray-400">Chạy đúng phép tìm mà tool này thực hiện, dựa trên file đã lưu của scope. Lưu thay đổi trước khi thử.</p>
            <form className="flex gap-2" onSubmit={test}>
              <Input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ví dụ: Đổi size trong bao nhiêu ngày?" />
              <Button type="submit" size="lg">Chạy</Button>
            </form>
            {hits && (hits.length
              ? <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300">{hits.map((hit) => <li key={hit.source_id}><code className="text-xs">{hit.source_id}</code> · {hit.title} <span className="text-gray-500">({hit.similarity.toFixed(3)})</span></li>)}</ul>
              : <p className="text-sm text-gray-500 dark:text-gray-400">Không có đoạn nào đạt ngưỡng; AI sẽ nhận kết quả rỗng khi hỏi câu này.</p>)}
          </div>
        </Panel>
      )}
    </div>
  );
}
