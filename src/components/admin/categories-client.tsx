'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm, useToast } from '@/components/admin/feedback';
import { FormField } from '@/components/admin/form';
import { EmptyState, PageHeader, th, td, thEnd } from '@/components/admin/page-header';
import { Badge } from '@/components/admin-ui/badge';
import { Button } from '@/components/admin-ui/button';
import { PlusIcon, TagIcon } from '@/components/admin-ui/icons';
import { Input } from '@/components/admin-ui/input';
import { Switch } from '@/components/admin-ui/switch';
import type { CategoryRow } from '@/features/catalog/admin-repository';
import { callApi } from '@/lib/client-api';

type Draft = { name: string; slug: string; description: string; sortOrder: number; isActive: boolean };
const blank: Draft = { name: '', slug: '', description: '', sortOrder: 0, isActive: true };
const toPayload = (draft: Draft) => ({ ...draft, slug: draft.slug.trim() || undefined });

export function CategoriesClient({ initial }: { initial: CategoryRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState<Draft>({ ...blank, sortOrder: initial.length });
  const [editingId, setEditingId] = useState<string>();
  const [draft, setDraft] = useState<Draft>(blank);
  const [busy, setBusy] = useState(false);

  /** Runs one API call, reports the outcome as a toast and refreshes the server data on success. */
  async function run(action: () => ReturnType<typeof callApi>, success: string, onDone?: () => void) {
    setBusy(true);
    const result = await action();
    setBusy(false);
    if (!result.ok) { toast('error', result.error); return; }
    toast('success', success);
    onDone?.();
    router.refresh();
  }

  const create = (event: FormEvent) => {
    event.preventDefault();
    void run(() => callApi('/api/admin/categories', { json: toPayload(creating) }), `Đã tạo danh mục “${creating.name}”.`, () => { setCreating({ ...blank, sortOrder: initial.length + 1 }); setAdding(false); });
  };
  const save = (id: string) => void run(() => callApi(`/api/admin/categories/${id}`, { method: 'PATCH', json: toPayload(draft) }), 'Đã lưu danh mục.', () => setEditingId(undefined));
  const toggle = (category: CategoryRow) => void run(
    () => callApi(`/api/admin/categories/${category.id}`, { method: 'PATCH', json: { name: category.name, slug: category.slug, description: category.description, sortOrder: category.sortOrder, isActive: !category.isActive } }),
    category.isActive ? `Đã ẩn “${category.name}”.` : `Đã hiển thị “${category.name}”.`,
  );
  async function remove(category: CategoryRow) {
    const ok = await confirm({ title: `Xóa danh mục “${category.name}”?`, message: 'Thao tác này không thể hoàn tác.', confirmLabel: 'Xóa danh mục', danger: true });
    if (ok) void run(() => callApi(`/api/admin/categories/${category.id}`, { method: 'DELETE' }), 'Đã xóa danh mục.');
  }
  const edit = (category: CategoryRow) => { setEditingId(category.id); setDraft({ name: category.name, slug: category.slug, description: category.description, sortOrder: category.sortOrder, isActive: category.isActive }); };

  return (
    <div className="space-y-6">
      <PageHeader title="Danh mục" description="Danh mục bị ẩn sẽ không hiển thị trên web, và chatbot không tư vấn sản phẩm thuộc danh mục đó."
        actions={!adding && <Button onClick={() => setAdding(true)}><PlusIcon />Thêm danh mục</Button>} />

      {adding && (
        <form onSubmit={create} className="grid gap-4 rounded-2xl border border-brand-300 bg-white p-5 sm:grid-cols-[1fr_1fr_110px] sm:p-6 dark:border-brand-500/40 dark:bg-white/3">
          <FormField label="Tên danh mục"><Input required autoFocus maxLength={80} value={creating.name} onChange={(e) => setCreating({ ...creating, name: e.target.value })} placeholder="Áo sơ mi" /></FormField>
          <FormField label="Mô tả (tuỳ chọn)"><Input maxLength={500} value={creating.description} onChange={(e) => setCreating({ ...creating, description: e.target.value })} /></FormField>
          <FormField label="Thứ tự"><Input type="number" min={0} value={creating.sortOrder} onChange={(e) => setCreating({ ...creating, sortOrder: Number(e.target.value) })} /></FormField>
          <div className="flex gap-2 sm:col-span-3 sm:justify-end"><Button type="button" variant="ghost" onClick={() => setAdding(false)}>Huỷ</Button><Button type="submit" disabled={busy}>Tạo danh mục</Button></div>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-gray-100 dark:border-white/5">
              <tr><th className={th}>Tên</th><th className={th}>Slug</th><th className={`${thEnd}`}>Thứ tự</th><th className={`${thEnd}`}>Sản phẩm</th><th className={th}>Hiển thị</th><th className="w-44" /></tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
              {initial.length === 0 && <tr><td colSpan={6}><EmptyState icon={<TagIcon />} title="Chưa có danh mục" hint="Tạo danh mục đầu tiên để bắt đầu thêm sản phẩm." /></td></tr>}
              {initial.map((category) => editingId === category.id ? (
                <tr key={category.id} className="bg-brand-50/40 dark:bg-brand-500/5">
                  <td className="px-5 py-3"><Input aria-label="Tên" className="h-10" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></td>
                  <td className="px-5 py-3"><Input aria-label="Slug" className="h-10" value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} /></td>
                  <td className="px-5 py-3"><Input aria-label="Thứ tự" type="number" min={0} className="ml-auto h-10 w-20 text-end" value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })} /></td>
                  <td className={`${td} text-end tabular-nums`}>{category.productCount}</td>
                  <td className="px-5 py-3"><Switch checked={draft.isActive} onCheckedChange={(checked) => setDraft({ ...draft, isActive: checked })} aria-label="Hiển thị" /></td>
                  <td className="whitespace-nowrap px-5 py-3 text-end"><Button size="xs" disabled={busy} onClick={() => save(category.id)}>Lưu</Button> <Button size="xs" variant="ghost" onClick={() => setEditingId(undefined)}>Huỷ</Button></td>
                </tr>
              ) : (
                <tr key={category.id} className="hover:bg-gray-50 dark:hover:bg-white/2">
                  <td className={td}><p className="font-medium text-gray-800 dark:text-white/90">{category.name}</p>{category.description && <p className="text-theme-xs text-gray-500 dark:text-gray-400">{category.description}</p>}</td>
                  <td className={`${td} text-gray-500`}>{category.slug}</td>
                  <td className={`${td} text-end tabular-nums`}>{category.sortOrder}</td>
                  <td className={`${td} text-end tabular-nums`}>{category.productCount}</td>
                  <td className="px-5 py-3.5"><button onClick={() => toggle(category)} disabled={busy} title="Bấm để đổi trạng thái"><Badge color={category.isActive ? 'success' : 'gray'} size="sm">{category.isActive ? 'Hiển thị' : 'Đang ẩn'}</Badge></button></td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-end">
                    <Button size="xs" variant="ghost" onClick={() => edit(category)}>Sửa</Button>
                    <Button size="xs" variant="ghost" className="text-red-500 hover:text-red-600 dark:text-red-400" onClick={() => void remove(category)}>Xóa</Button>
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
