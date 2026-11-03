import { LookupForm } from '@/components/shop/lookup-form';

export const metadata = { title: 'Tra cứu đơn hàng', robots: { index: false } };

export default async function LookupPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  return (
    <div className="mx-auto max-w-3xl py-10">
      <h1 className="font-display text-4xl tracking-tight">Tra cứu đơn hàng</h1>
      <p className="mt-2 mb-8 text-ink-soft">Nhập mã đơn và số điện thoại bạn đã dùng khi đặt hàng.</p>
      <LookupForm defaultCode={(code ?? '').slice(0, 30)} />
    </div>
  );
}
