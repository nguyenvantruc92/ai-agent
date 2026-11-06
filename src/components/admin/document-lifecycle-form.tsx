'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/admin/feedback';
import { Button } from '@/components/admin-ui/button';
import { Input } from '@/components/admin-ui/input';

type Props = { id: string; initial: { contentKind: 'general' | 'policy'; policyKey: string | null; effectiveFrom: string | null; effectiveTo: string | null; supersedesDocumentId: string | null } };

export default function DocumentLifecycleForm({ id, initial }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [contentKind, setContentKind] = useState(initial.contentKind);
  const [policyKey, setPolicyKey] = useState(initial.policyKey ?? '');
  const [effectiveFrom, setEffectiveFrom] = useState(initial.effectiveFrom?.slice(0, 10) ?? '');
  const [effectiveTo, setEffectiveTo] = useState(initial.effectiveTo?.slice(0, 10) ?? '');
  const [supersedesDocumentId, setSupersedesDocumentId] = useState(initial.supersedesDocumentId ?? '');
  async function save() {
    setBusy(true);
    const response = await fetch(`/api/admin/documents/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contentKind, policyKey: policyKey || null, effectiveFrom: effectiveFrom || null, effectiveTo: effectiveTo || null, supersedesDocumentId: supersedesDocumentId || null }) });
    setBusy(false);
    if (!response.ok) { toast('error', (await response.json().catch(() => ({}))).error ?? 'Không lưu được metadata.'); return; }
    toast('success', 'Đã lưu metadata. Re-index để áp dụng cho version mới.'); router.refresh();
  }
  return <div className="grid gap-3 md:grid-cols-2">
    <label className="text-sm text-gray-700 dark:text-gray-300">Loại tài liệu<select className="mt-1 h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900" value={contentKind} onChange={(event) => setContentKind(event.target.value as 'general' | 'policy')}><option value="general">Tài liệu chung</option><option value="policy">Chính sách</option></select></label>
    {contentKind === 'policy' && <label className="text-sm text-gray-700 dark:text-gray-300">Policy key<Input className="mt-1" value={policyKey} onChange={(event) => setPolicyKey(event.target.value)} placeholder="doi-tra, giao-hang…" /></label>}
    {contentKind === 'policy' && <label className="text-sm text-gray-700 dark:text-gray-300">Có hiệu lực từ<Input className="mt-1" type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></label>}
    {contentKind === 'policy' && <label className="text-sm text-gray-700 dark:text-gray-300">Hết hiệu lực<Input className="mt-1" type="date" value={effectiveTo} onChange={(event) => setEffectiveTo(event.target.value)} /></label>}
    {contentKind === 'policy' && <label className="text-sm text-gray-700 dark:text-gray-300 md:col-span-2">ID tài liệu bị thay thế (tuỳ chọn)<Input className="mt-1" value={supersedesDocumentId} onChange={(event) => setSupersedesDocumentId(event.target.value)} placeholder="UUID của tài liệu cũ" /></label>}
    <div><Button size="sm" disabled={busy} onClick={() => void save()}>{busy ? 'Đang lưu…' : 'Lưu metadata'}</Button></div>
  </div>;
}
