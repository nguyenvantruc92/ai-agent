'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useConfirm, useToast } from '@/components/admin/feedback';
import { FormField, NativeSelect } from '@/components/admin/form';
import { ImageManager } from '@/components/admin/image-manager';
import { VariantsEditor, type VariantDraft } from '@/components/admin/variants-editor';
import { Badge } from '@/components/admin-ui/badge';
import { Button } from '@/components/admin-ui/button';
import { AlertIcon, CheckIcon } from '@/components/admin-ui/icons';
import { Input } from '@/components/admin-ui/input';
import { Textarea } from '@/components/admin-ui/textarea';
import type { CategoryRow, ProductDetail } from '@/features/catalog/admin-repository';
import { cn } from '@/lib/cn';
import { callApi } from '@/lib/client-api';
import { formatVnd } from '@/lib/format';
import { slugify } from '@/lib/slug';

type Status = 'draft' | 'active' | 'archived';
const statusColor = { draft: 'gray', active: 'success', archived: 'warning' } as const;
const statusText = { draft: 'Nháp', active: 'Đang bán', archived: 'Lưu trữ' } as const;
const card = 'space-y-4 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-gray-800 dark:bg-white/3';
const cardTitle = 'text-lg font-semibold text-gray-800 dark:text-white/90';

export function ProductForm({ categories, product }: { categories: CategoryRow[]; product?: ProductDetail }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [code, setCode] = useState(product?.code ?? '');
  const [name, setName] = useState(product?.name ?? '');
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? categories[0]?.id ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [material, setMaterial] = useState(product?.material ?? '');
  const [priceVnd, setPriceVnd] = useState(product?.priceVnd ?? 0);
  const [compareAt, setCompareAt] = useState<number | ''>(product?.compareAtPriceVnd ?? '');
  const [status, setStatus] = useState<Status>(product?.status ?? 'draft');
  const [variants, setVariants] = useState<VariantDraft[]>(product?.variants.map(({ size, color, stock, isActive }) => ({ size, color, stock, isActive })) ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const snapshot = useMemo(() => JSON.stringify({ code, name, categoryId, description, material, priceVnd, compareAt, status, variants }), [code, name, categoryId, description, material, priceVnd, compareAt, status, variants]);
  const [saved, setSaved] = useState(snapshot);
  const dirty = snapshot !== saved;
  const discount = compareAt !== '' && compareAt > priceVnd && priceVnd > 0 ? Math.round((1 - priceVnd / compareAt) * 100) : 0;
  const totalStock = variants.filter((variant) => variant.isActive).reduce((sum, variant) => sum + variant.stock, 0);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    const payload = { name, categoryId, description, material, priceVnd, compareAtPriceVnd: compareAt === '' ? null : compareAt, status, variants };
    const result = product
      ? await callApi(`/api/admin/products/${product.id}`, { method: 'PATCH', json: payload })
      : await callApi<ProductDetail>('/api/admin/products', { json: { ...payload, code } });
    setBusy(false);
    if (!result.ok) { setError(result.error); toast('error', result.error); return; }
    setSaved(snapshot);
    toast('success', product ? 'Đã lưu. Chatbot sẽ cập nhật sau vài giây.' : 'Đã tạo sản phẩm. Bạn có thể tải ảnh lên ngay.');
    if (!product) { router.push(`/admin/products/${(result.data as ProductDetail).id}`); return; }
    router.refresh();
  }

  async function remove() {
    if (!product) return;
    const ok = await confirm({ title: `Xóa “${product.name}”?`, message: 'Sản phẩm sẽ ngừng hiển thị trên web và chatbot. Mã sản phẩm vẫn được giữ chỗ.', confirmLabel: 'Xóa sản phẩm', danger: true });
    if (!ok) return;
    const result = await callApi(`/api/admin/products/${product.id}`, { method: 'DELETE' });
    if (!result.ok) { toast('error', result.error); return; }
    toast('success', 'Đã xóa sản phẩm.');
    router.push('/admin/products');
  }

  async function leave() {
    if (dirty && !(await confirm({ title: 'Bỏ các thay đổi chưa lưu?', confirmLabel: 'Bỏ thay đổi', danger: true }))) return;
    router.push('/admin/products');
  }

  return (
    <div className="pb-24">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button type="button" onClick={() => void leave()} className="text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white">← Sản phẩm</button>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-title-sm font-semibold text-gray-800 sm:text-title-lg dark:text-white/90">{product ? product.name : 'Thêm sản phẩm'}</h1>
            <Badge color={statusColor[status]} size="sm">{statusText[status]}</Badge>
          </div>
          {product && <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">{product.code} · /{product.slug} · cập nhật {new Date(product.updatedAt).toLocaleString('vi-VN')}</p>}
        </div>
        {product && <Button type="button" variant="ghost" className="text-red-500 hover:text-red-600 dark:text-red-400" onClick={() => void remove()}>Xóa sản phẩm</Button>}
      </div>
      {categories.length === 0 && <p className="mb-5 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-600 dark:bg-orange-500/10 dark:text-orange-400">Chưa có danh mục nào. <Link className="underline" href="/admin/categories">Tạo danh mục</Link> trước khi thêm sản phẩm.</p>}

      <form id="product-form" onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className={card}>
            <h2 className={cardTitle}>Thông tin chung</h2>
            <div className="grid gap-4 sm:grid-cols-[170px_1fr]">
              <FormField label="Mã sản phẩm" hint={product ? 'Không đổi được sau khi tạo' : 'Ví dụ SM-001'}><Input required disabled={Boolean(product)} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} placeholder="SM-001" /></FormField>
              <FormField label="Tên sản phẩm" hint={!product && name ? `Đường dẫn: /${slugify(name)}-${slugify(code || 'ma')}` : undefined}><Input required value={name} onChange={(e) => setName(e.target.value)} maxLength={160} /></FormField>
            </div>
            <FormField label="Mô tả" hint={`${description.length}/2000 ký tự · chatbot dùng mô tả này để tư vấn`}><Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} /></FormField>
            <FormField label="Chất liệu"><Input value={material} onChange={(e) => setMaterial(e.target.value)} maxLength={200} placeholder="100% cotton" /></FormField>
          </section>
          <VariantsEditor value={variants} onChange={setVariants} />
        </div>

        <div className="space-y-6">
          <section className={card}>
            <h2 className={cardTitle}>Bán hàng</h2>
            <FormField label="Trạng thái" hint="Chỉ sản phẩm “Đang bán” hiển thị trên web và chatbot."><NativeSelect value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              <option value="draft">Nháp</option><option value="active">Đang bán</option><option value="archived">Lưu trữ</option></NativeSelect></FormField>
            <FormField label="Danh mục"><NativeSelect required value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.isActive ? '' : ' (đang ẩn)'}</option>)}</NativeSelect></FormField>
            <FormField label="Giá bán (VNĐ)" hint={priceVnd ? formatVnd(priceVnd) : undefined}><Input required type="number" min={0} step={1000} value={priceVnd} onChange={(e) => setPriceVnd(Number(e.target.value))} /></FormField>
            <FormField label="Giá gốc (VNĐ)" hint={discount ? `Hiển thị giảm ${discount}%` : 'Điền khi đang giảm giá; phải lớn hơn giá bán.'}><Input type="number" min={0} step={1000} value={compareAt} onChange={(e) => setCompareAt(e.target.value === '' ? '' : Number(e.target.value))} /></FormField>
            <dl className="grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-3 text-sm dark:bg-white/3">
              <div><dt className="text-theme-xs text-gray-500 dark:text-gray-400">Biến thể đang bán</dt><dd className="font-semibold text-gray-800 tabular-nums dark:text-white/90">{variants.filter((variant) => variant.isActive).length}</dd></div>
              <div><dt className="text-theme-xs text-gray-500 dark:text-gray-400">Tổng tồn kho</dt><dd className="font-semibold text-gray-800 tabular-nums dark:text-white/90">{totalStock}</dd></div>
            </dl>
          </section>
          {product
            ? <ImageManager productId={product.id} initial={product.images} />
            : <p className="rounded-2xl border border-dashed border-gray-300 p-5 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">Lưu sản phẩm trước, sau đó tải ảnh lên.</p>}
        </div>
      </form>

      <div className="fixed inset-x-0 bottom-0 z-99 border-t border-gray-200 bg-white/95 backdrop-blur lg:left-72.5 dark:border-gray-800 dark:bg-gray-900/95">
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <p className={cn('flex items-center gap-2 text-sm', error ? 'text-red-500' : dirty ? 'text-orange-500' : 'text-gray-500 dark:text-gray-400')} role={error ? 'alert' : undefined}>
            {error ? <><AlertIcon className="size-5" />{error}</> : dirty ? <><span className="size-2 rounded-full bg-orange-500" />Có thay đổi chưa lưu</> : <><CheckIcon className="size-5" />Mọi thay đổi đã được lưu</>}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => void leave()}>Huỷ</Button>
            <Button type="submit" form="product-form" disabled={busy || categories.length === 0 || (Boolean(product) && !dirty)}>{busy ? 'Đang lưu…' : product ? 'Lưu thay đổi' : 'Tạo sản phẩm'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
