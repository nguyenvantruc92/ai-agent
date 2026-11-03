'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm, useToast } from '@/components/admin/feedback';
import { Button } from '@/components/admin-ui/button';

export default function DocumentActions({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  async function run(request: () => Promise<Response>, success: string, after: () => void) {
    setBusy(true);
    const response = await request();
    setBusy(false);
    if (!response.ok) { toast('error', (await response.json().catch(() => ({}))).error ?? 'Thao tác thất bại.'); return; }
    toast('success', success);
    after();
  }
  const reindex = () => run(() => fetch(`/api/admin/documents/${id}/reindex`, { method: 'POST' }), 'Đã xếp hàng index lại.', () => router.refresh());
  async function remove() {
    if (!(await confirm({ title: 'Xóa mềm tài liệu này?', message: 'Chatbot sẽ ngừng dùng tài liệu này.', confirmLabel: 'Xóa', danger: true }))) return;
    void run(() => fetch(`/api/admin/documents/${id}`, { method: 'DELETE' }), 'Đã xóa tài liệu.', () => router.push('/admin/knowledge'));
  }
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" disabled={busy} onClick={() => void reindex()}>Re-index</Button>
      <Button variant="outline" size="sm" className="border-red-200 text-red-500 hover:text-red-600 dark:border-red-500/30" disabled={busy} onClick={() => void remove()}>Xóa</Button>
      <Button variant="ghost" size="sm" onClick={() => router.refresh()}>Làm mới</Button>
    </div>
  );
}
