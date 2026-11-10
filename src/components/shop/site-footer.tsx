import Link from 'next/link';
import { OpenChatButton } from '@/components/shop/chat-widget';
import { getShopSettings } from '@/features/shop/settings';
import { formatVnd } from '@/lib/format';

export async function SiteFooter() {
  const settings = await getShopSettings();
  return (
    <footer className="mt-24 bg-ink text-white/70">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm md:grid-cols-3">
        <div><p className="text-lg font-extrabold tracking-[0.14em] text-white">TOMODEV</p><p className="mt-2 max-w-xs">Thời trang nam tối giản: sơ mi, polo, chinos và phụ kiện, chất liệu thoải mái, form chuẩn.</p></div>
        <div>
          <p className="font-semibold text-white">Chính sách</p>
          <ul className="mt-2 space-y-1.5">
            <li>Miễn phí giao hàng từ {formatVnd(settings.freeShippingFromVnd)}</li>
            <li>Phí giao hàng tiêu chuẩn {formatVnd(settings.shippingFeeVnd)}</li>
            <li>Đổi size trong 7 ngày kể từ ngày nhận</li>
            <li>Thanh toán COD, chuyển khoản hoặc thẻ</li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-white">Cần tư vấn?</p>
          <p className="mt-2">Hỏi trợ lý AI về size, chất liệu, chính sách đổi trả hoặc tra cứu đơn hàng.</p>
          <Link href="/orders/lookup" className="mt-3 mr-4 inline-block underline underline-offset-4 hover:text-white">Tra cứu đơn hàng</Link>
          <OpenChatButton className="mt-3 inline-block font-medium text-[#c4b5fd] underline underline-offset-4 hover:text-white">Mở khung chat →</OpenChatButton>
        </div>
      </div>
      <p className="border-t border-white/10 py-4 text-center text-xs text-white/50">© Tomodev Fashion</p>
    </footer>
  );
}
