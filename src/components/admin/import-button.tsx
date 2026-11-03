'use client';

import { ChangeEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/admin/feedback';
import { UploadIcon } from '@/components/admin-ui/icons';
import { cn } from '@/lib/cn';
import { callApi } from '@/lib/client-api';

type Summary = { products: number; created: number; updated: number; categories: number };

export function ImportButton() {
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    const body = new FormData(); body.set('file', file);
    const result = await callApi<Summary>('/api/admin/products/import', { method: 'POST', body });
    setBusy(false);
    if (input.current) input.current.value = '';
    if (!result.ok) { toast('error', result.error); return; }
    toast('success', `Đã import ${result.data.products} sản phẩm (${result.data.created} mới, ${result.data.updated} cập nhật).`);
    router.refresh();
  }

  return (
    <label className={cn('inline-flex h-10 cursor-pointer items-center gap-2 rounded-[10px] border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700/50', busy && 'pointer-events-none opacity-60')}>
      <UploadIcon className="size-5" />{busy ? 'Đang import…' : 'Import XLSX'}
      <input ref={input} type="file" className="sr-only" accept=".xlsx" disabled={busy} onChange={(event) => void upload(event)} />
    </label>
  );
}
