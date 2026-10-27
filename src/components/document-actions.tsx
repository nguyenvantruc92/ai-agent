'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DocumentActions({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(request: () => Promise<Response>, after: () => void) {
    setBusy(true); setError('');
    const response = await request();
    setBusy(false);
    if (response.ok) after();
    else setError((await response.json().catch(() => ({}))).error ?? 'Thao tác thất bại.');
  }
  const reindex = () => run(() => fetch(`/api/admin/documents/${id}/reindex`, { method: 'POST' }), () => router.refresh());
  const remove = () => { if (confirm('Xóa mềm tài liệu này?')) void run(() => fetch(`/api/admin/documents/${id}`, { method: 'DELETE' }), () => router.push('/admin/knowledge')); };
  return <div className="flex items-center gap-3">
    <button className="rounded border px-3 py-1.5 text-sm disabled:opacity-50" disabled={busy} onClick={() => void reindex()}>Re-index</button>
    <button className="rounded border border-red-200 px-3 py-1.5 text-sm text-red-700 disabled:opacity-50" disabled={busy} onClick={remove}>Xóa</button>
    <button className="text-sm underline" onClick={() => router.refresh()}>Làm mới</button>
    {error && <span className="text-sm text-red-700">{error}</span>}
  </div>;
}
