'use client';

import { useState } from 'react';
import { FormField } from '@/components/admin/form';
import { Button } from '@/components/admin-ui/button';
import { Input } from '@/components/admin-ui/input';
import { Switch } from '@/components/admin-ui/switch';
import { TrashBinIcon } from '@/components/admin-ui/icons';
import { cn } from '@/lib/cn';

export type VariantDraft = { size: string; color: string; stock: number; isActive: boolean };

const parseList = (value: string) => [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];

/** Editable size × colour matrix. "Tạo ma trận" adds the missing combinations and never touches existing stock. */
export function VariantsEditor({ value, onChange }: { value: VariantDraft[]; onChange: (next: VariantDraft[]) => void }) {
  const [sizes, setSizes] = useState('');
  const [colors, setColors] = useState('');

  function generate() {
    const wantedSizes = parseList(sizes);
    const wantedColors = parseList(colors);
    if (!wantedSizes.length || !wantedColors.length) return;
    const have = new Set(value.map((variant) => `${variant.size}\u0000${variant.color}`));
    const added = wantedSizes.flatMap((size) => wantedColors.map((color) => ({ size, color, stock: 0, isActive: true })))
      .filter((variant) => !have.has(`${variant.size}\u0000${variant.color}`));
    onChange([...value, ...added]);
    setSizes(''); setColors('');
  }
  const patch = (index: number, change: Partial<VariantDraft>) => onChange(value.map((variant, i) => (i === index ? { ...variant, ...change } : variant)));

  return (
    <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-gray-800 dark:bg-white/3">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Biến thể &amp; tồn kho</h2>
        <p className="text-theme-xs text-gray-500 dark:text-gray-400">Mỗi dòng là một cặp size/màu có tồn kho riêng. Dòng bị xóa khỏi danh sách sẽ được tắt (không mất lịch sử đơn).</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <FormField label="Size (cách nhau bằng dấu phẩy)"><Input value={sizes} onChange={(e) => setSizes(e.target.value)} placeholder="S, M, L, XL" /></FormField>
        <FormField label="Màu"><Input value={colors} onChange={(e) => setColors(e.target.value)} placeholder="Trắng, Xanh navy" /></FormField>
        <Button type="button" variant="outline" size="lg" onClick={generate}>Tạo ma trận</Button>
      </div>
      {value.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="w-full min-w-[460px] text-sm">
            <thead className="border-b border-gray-100 bg-gray-50 text-start text-theme-xs text-gray-500 dark:border-white/5 dark:bg-white/2 dark:text-gray-400"><tr><th className="px-4 py-2.5 text-start font-medium">Size</th><th className="px-4 py-2.5 text-start font-medium">Màu</th><th className="px-4 py-2.5 text-start font-medium">Tồn kho</th><th className="px-4 py-2.5 text-start font-medium">Bán</th><th /></tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
              {value.map((variant, index) => (
                <tr key={`${variant.size}|${variant.color}|${index}`} className={cn(!variant.isActive && 'bg-gray-50/70 opacity-70 dark:bg-white/2')}>
                  <td className="px-4 py-2"><Input aria-label="Size" className="h-10 w-24" value={variant.size} onChange={(e) => patch(index, { size: e.target.value })} /></td>
                  <td className="px-4 py-2"><Input aria-label="Màu" className="h-10" value={variant.color} onChange={(e) => patch(index, { color: e.target.value })} /></td>
                  <td className="px-4 py-2"><Input aria-label="Tồn kho" type="number" min={0} className="h-10 w-28 tabular-nums" value={variant.stock} onChange={(e) => patch(index, { stock: Number(e.target.value) })} /></td>
                  <td className="px-4 py-2"><Switch aria-label="Đang bán" checked={variant.isActive} onCheckedChange={(checked) => patch(index, { isActive: checked })} /></td>
                  <td className="px-4 py-2 text-end"><button type="button" aria-label="Xóa dòng" className="text-gray-400 hover:text-red-500" onClick={() => onChange(value.filter((_, i) => i !== index))}><TrashBinIcon className="size-5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...value, { size: '', color: '', stock: 0, isActive: true }])}>+ Thêm dòng</Button>
    </section>
  );
}
