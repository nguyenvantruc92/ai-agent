import Link from 'next/link';
import { buttonClass } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="text-xs font-medium tracking-[0.25em] text-brand uppercase">404</p>
      <h1 className="mt-3 font-display text-4xl tracking-tight">Không tìm thấy trang</h1>
      <p className="mt-2 text-ink-soft">Sản phẩm hoặc danh mục này không còn tồn tại hoặc đã được ẩn.</p>
      <Link href="/" className={`${buttonClass({ variant: 'primary', size: 'lg' })} mt-8`}>Về trang chủ</Link>
    </div>
  );
}
