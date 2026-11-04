'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm, useToast } from '@/components/admin/feedback';
import { FormField } from '@/components/admin/form';
import { Button } from '@/components/admin-ui/button';
import { Input } from '@/components/admin-ui/input';
import type { OpenAiKeyStatus } from '@/features/settings/openai-key';
import { callApi } from '@/lib/client-api';

const ENDPOINT = '/api/admin/settings/openai';

/** Where the chatbot's OpenAI key comes from, and a form to replace it. The key itself is never sent back to the browser. */
export function OpenAiKeyForm({ initial }: { initial: OpenAiKeyStatus }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState(initial);
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | 'remove' | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy('save');
    const result = await callApi<OpenAiKeyStatus>(ENDPOINT, { method: 'PUT', json: { apiKey } });
    setBusy(null);
    if (!result.ok) { toast('error', result.error); return; }
    setStatus(result.data); setApiKey('');
    toast('success', 'Đã lưu khóa OpenAI. Chatbot dùng khóa mới trong vài giây; catalog đang được đồng bộ lại.');
    router.refresh();
  }

  async function test() {
    setBusy('test');
    const result = await callApi(ENDPOINT, { method: 'POST', json: apiKey ? { apiKey } : {} });
    setBusy(null);
    toast(result.ok ? 'success' : 'error', result.ok ? 'Khóa hợp lệ, OpenAI chấp nhận.' : result.error);
  }

  async function remove() {
    if (!(await confirm({ title: 'Xóa khóa đã lưu?', message: status.envFallback ? 'Chatbot sẽ dùng lại khóa trong file .env.' : 'Chatbot sẽ ngừng hoạt động cho đến khi bạn nhập khóa mới.', confirmLabel: 'Xóa khóa', danger: true }))) return;
    setBusy('remove');
    const result = await callApi<OpenAiKeyStatus>(ENDPOINT, { method: 'DELETE' });
    setBusy(null);
    if (!result.ok) { toast('error', result.error); return; }
    setStatus(result.data);
    toast('success', 'Đã xóa khóa đã lưu.');
    router.refresh();
  }

  const badge = status.source === 'admin'
    ? { text: 'Đang dùng khóa lưu trong Admin', tone: 'bg-green-50 text-green-600 dark:bg-green-500/15 dark:text-green-500' }
    : status.source === 'env'
      ? { text: 'Đang dùng khóa trong file .env', tone: 'bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400' }
      : { text: 'Chưa có khóa: chatbot chưa hoạt động', tone: 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-500' };

  return (
    <form onSubmit={save} className="max-w-2xl space-y-5 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-gray-800 dark:bg-white/3">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Khóa OpenAI (chatbot)</h2>
        <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">Dùng cho trả lời chat, tìm kiếm ngữ nghĩa và tạo embedding khi đồng bộ catalog/Knowledge.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded-full px-3 py-1 text-theme-xs font-medium ${badge.tone}`}>{badge.text}</span>
        {status.hint && <span className="font-mono text-theme-sm text-gray-600 dark:text-gray-300">sk-…{status.hint}</span>}
        {status.updatedAt && <span className="text-theme-xs text-gray-500 dark:text-gray-400">Cập nhật {new Date(status.updatedAt).toLocaleString('vi-VN')}</span>}
      </div>
      {status.unreadable && <p className="rounded-xl bg-orange-50 px-4 py-3 text-theme-sm text-orange-600 dark:bg-orange-500/10 dark:text-orange-400">Khóa đã lưu không đọc được (có thể do đổi ADMIN_SESSION_SECRET hoặc SETTINGS_ENCRYPTION_KEY). Hãy nhập lại khóa.</p>}
      <FormField label={status.source === 'admin' ? 'Thay bằng khóa mới' : 'Nhập khóa OpenAI'} hint="Bắt đầu bằng sk-. Khóa được kiểm tra với OpenAI trước khi lưu, mã hóa AES-256 trong cơ sở dữ liệu và không hiển thị lại.">
        <Input type="password" autoComplete="off" spellCheck={false} placeholder="sk-…" value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
      </FormField>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={busy !== null || (!apiKey && status.source === 'none')} onClick={test}>{busy === 'test' ? 'Đang kiểm tra…' : apiKey ? 'Kiểm tra khóa này' : 'Kiểm tra khóa đang dùng'}</Button>
          {status.source === 'admin' && <Button type="button" variant="ghost" disabled={busy !== null} onClick={remove}>Xóa khóa đã lưu</Button>}
        </div>
        <Button type="submit" disabled={busy !== null || apiKey.trim().length < 20}>{busy === 'save' ? 'Đang kiểm tra và lưu…' : 'Lưu khóa'}</Button>
      </div>
    </form>
  );
}
