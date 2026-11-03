import type { Metadata } from 'next';
import { Badge } from '@/components/ui/badge';
import { Button, buttonClass } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Price } from '@/components/ui/price';

export const metadata: Metadata = { title: 'UI kit · Tomodev' };

const Icon = ({ d, className = 'size-5' }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d={d} />
  </svg>
);
const icons = {
  bag: 'M6 7h12l1 13H5L6 7Zm3 0a3 3 0 1 1 6 0',
  search: 'm21 21-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z',
  truck: 'M3 6h11v10H3zM14 10h4l3 3v3h-7M7 19a1.5 1.5 0 1 0 0-.01M17 19a1.5 1.5 0 1 0 0-.01',
  swap: 'M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4m4 4H7',
  shield: 'M12 3 4 6v6c0 4.5 3.2 7.7 8 9 4.8-1.3 8-4.5 8-9V6l-8-3Z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
};

const categories = [
  { name: 'Áo sơ mi', count: 12, tone: 'bg-[#e9e2d3]' },
  { name: 'Áo polo', count: 8, tone: 'bg-[#d9dfd6]' },
  { name: 'Quần', count: 14, tone: 'bg-[#d8d5cc]' },
  { name: 'Phụ kiện', count: 9, tone: 'bg-[#e6d9cc]' },
];

const products = [
  { name: 'Áo sơ mi Oxford trắng dáng regular', cat: 'Áo sơ mi', price: 499000, old: null, tone: 'bg-[#ece7dc]', sizes: ['S', 'M', 'L', 'XL'], badge: 'Mới' },
  { name: 'Quần chinos be dáng slim taper', cat: 'Quần', price: 549000, old: null, tone: 'bg-[#dcd3c0]', sizes: ['29', '30', '31', '32'], badge: null },
  { name: 'Quần jeans slim fit xanh đậm', cat: 'Quần', price: 413400, old: 689000, tone: 'bg-[#c9d0d8]', sizes: ['30', '31', '32'], badge: '-40%' },
  { name: 'Áo polo pique xanh navy', cat: 'Áo polo', price: 389000, old: null, tone: 'bg-[#cbd2dc]', sizes: ['M', 'L'], badge: null },
  { name: 'Áo khoác bomber đen', cat: 'Áo khoác', price: 899000, old: null, tone: 'bg-[#cfcdc8]', sizes: [], badge: 'Hết hàng' },
  { name: 'Thắt lưng da nâu bản 3,5 cm', cat: 'Phụ kiện', price: 399000, old: null, tone: 'bg-[#e1d2bf]', sizes: ['105', '110'], badge: null },
];

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 py-14">
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
        <h2 className="font-display text-2xl tracking-tight">{title}</h2>
        {note && <p className="text-sm text-ink-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function ProductCard({ p }: { p: (typeof products)[number] }) {
  const soldOut = p.badge === 'Hết hàng';
  return (
    <article className="group">
      <div className={`relative aspect-[4/5] overflow-hidden rounded-card ${p.tone}`}>
        <div className="absolute inset-x-[18%] bottom-0 top-[14%] rounded-t-[40%] bg-white/35 transition-transform duration-500 group-hover:scale-105" />
        {p.badge && (
          <span className="absolute left-3 top-3">
            <Badge tone={soldOut ? 'neutral' : p.badge.startsWith('-') ? 'sale' : 'brand'}>{p.badge}</Badge>
          </span>
        )}
        {!soldOut && (
          <div className="absolute inset-x-3 bottom-3 translate-y-2 opacity-0 transition duration-200 group-hover:translate-y-0 group-hover:opacity-100">
            <button className={`${buttonClass({ variant: 'primary', size: 'sm' })} w-full`}>Thêm nhanh</button>
          </div>
        )}
      </div>
      <div className="mt-3 space-y-1">
        <p className="text-xs uppercase tracking-wider text-ink-muted">{p.cat}</p>
        <h3 className="line-clamp-2 text-sm font-medium leading-snug text-ink">{p.name}</h3>
        <Price value={p.price} oldValue={p.old} />
        {p.sizes.length > 0 && <p className="text-xs text-ink-muted">Size: {p.sizes.join(' · ')}</p>}
      </div>
    </article>
  );
}

const swatches: [string, string][] = [
  ['paper', 'bg-paper'], ['surface', 'bg-surface'], ['sand', 'bg-sand'], ['line', 'bg-line'],
  ['ink', 'bg-ink'], ['ink-soft', 'bg-ink-soft'], ['ink-muted', 'bg-ink-muted'],
  ['brand', 'bg-brand'], ['brand-soft', 'bg-brand-soft'], ['sale', 'bg-sale'], ['sale-soft', 'bg-sale-soft'], ['warn-soft', 'bg-warn-soft'],
];

export default function UiKitPage() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* ───────── Storefront chrome ───────── */}
      <div className="bg-ink px-4 py-2 text-center text-xs text-paper/90">
        Miễn phí giao hàng từ 799.000₫ <span className="mx-2 opacity-40">|</span> Đổi size trong 7 ngày
      </div>
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
          <a href="#" className="font-display text-xl font-semibold tracking-[0.18em]">TOMODEV</a>
          <nav className="hidden gap-6 text-sm text-ink-soft md:flex">
            {['Áo sơ mi', 'Áo polo', 'Quần', 'Áo khoác', 'Phụ kiện'].map((item) => <a key={item} href="#" className="hover:text-ink">{item}</a>)}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <div className="relative hidden sm:block">
              <Icon d={icons.search} className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
              <input placeholder="Tìm sản phẩm…" className="h-9 w-56 rounded-full border border-line bg-surface pl-9 pr-3 text-sm placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
            </div>
            <a href="#" className="relative grid size-10 place-items-center rounded-full hover:bg-sand" aria-label="Giỏ hàng">
              <Icon d={icons.bag} />
              <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-brand text-[10px] font-semibold text-white">2</span>
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4">
        {/* ───────── Hero ───────── */}
        <section className="grid items-center gap-8 py-12 md:grid-cols-2 md:py-20">
          <div>
            <p className="mb-4 text-xs font-medium uppercase tracking-[0.25em] text-brand">Bộ sưu tập mới</p>
            <h1 className="font-display text-4xl leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">Tối giản,<br />mặc là ra chất.</h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-ink-soft">Sơ mi, polo, chinos và phụ kiện cho nam: chất liệu cotton, linen dễ chịu, form chuẩn, đổi size miễn phí trong 7 ngày.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#products" className={buttonClass({ variant: 'primary', size: 'lg' })}>Mua ngay</a>
              <a href="#" className={buttonClass({ variant: 'outline', size: 'lg' })}>Hỏi trợ lý AI</a>
            </div>
          </div>
          <div className="grid aspect-[5/4] grid-cols-3 grid-rows-2 gap-3">
            <div className="col-span-2 row-span-2 rounded-card bg-[#e4dccb]" />
            <div className="rounded-card bg-brand" />
            <div className="rounded-card bg-[#cfd6d0]" />
          </div>
        </section>

        {/* ───────── Trust strip ───────── */}
        <ul className="grid gap-4 rounded-card border border-line bg-surface p-5 sm:grid-cols-3">
          {[
            [icons.truck, 'Giao nhanh toàn quốc', 'Nhận hàng 2–4 ngày'],
            [icons.swap, 'Đổi size dễ dàng', 'Trong 7 ngày kể từ khi nhận'],
            [icons.shield, 'Thanh toán an toàn', 'COD hoặc thanh toán online'],
          ].map(([d, t, s]) => (
            <li key={t} className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-brand-soft text-brand"><Icon d={d} /></span>
              <div><p className="text-sm font-medium">{t}</p><p className="text-xs text-ink-muted">{s}</p></div>
            </li>
          ))}
        </ul>

        {/* ───────── Categories ───────── */}
        <Section id="categories" title="Danh mục" note="Hiển thị từ bảng categories">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {categories.map((c) => (
              <a key={c.name} href="#" className="group relative aspect-[4/5] overflow-hidden rounded-card">
                <div className={`absolute inset-0 ${c.tone} transition-transform duration-500 group-hover:scale-105`} />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 to-transparent p-4 text-white">
                  <p className="font-display text-lg">{c.name}</p>
                  <p className="text-xs text-white/80">{c.count} sản phẩm</p>
                </div>
              </a>
            ))}
          </div>
        </Section>

        {/* ───────── Product grid ───────── */}
        <Section id="products" title="Sản phẩm nổi bật" note="Thẻ sản phẩm: ảnh 4:5, badge, giá cũ, size còn hàng">
          <div className="mb-6 flex flex-wrap gap-2">
            {['Tất cả', 'Áo sơ mi', 'Áo polo', 'Quần', 'Phụ kiện'].map((chip, i) => (
              <button key={chip} className={`h-9 rounded-full border px-4 text-sm transition-colors ${i === 0 ? 'border-ink bg-ink text-paper' : 'border-line bg-surface text-ink-soft hover:border-ink hover:text-ink'}`}>{chip}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => <ProductCard key={p.name} p={p} />)}
          </div>
        </Section>

        {/* ───────── Product detail ───────── */}
        <Section id="detail" title="Chi tiết sản phẩm" note="Chọn size/màu theo biến thể, tồn kho theo từng biến thể">
          <div className="grid gap-10 md:grid-cols-2">
            <div className="grid grid-cols-4 gap-3">
              <div className="col-span-4 aspect-[4/5] rounded-card bg-[#ece7dc]" />
              {['bg-[#e2dccf]', 'bg-[#d8d1c1]', 'bg-[#cfc8b8]', 'bg-[#c6bfae]'].map((t) => <div key={t} className={`aspect-square rounded-md ${t}`} />)}
            </div>
            <div className="space-y-6">
              <div>
                <p className="mb-1 text-xs uppercase tracking-wider text-ink-muted">Áo sơ mi · SM-001</p>
                <h3 className="font-display text-3xl tracking-tight">Áo sơ mi Oxford trắng dáng regular</h3>
                <div className="mt-3"><Price value={499000} oldValue={599000} size="lg" /></div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Màu: <span className="font-normal text-ink-soft">Trắng</span></p>
                <div className="flex gap-2">
                  {['bg-white', 'bg-[#bcd0e3]', 'bg-[#2c3e55]'].map((c, i) => <button key={c} aria-label={`Màu ${i + 1}`} className={`size-8 rounded-full border ${c} ${i === 0 ? 'ring-2 ring-ink ring-offset-2 ring-offset-paper' : 'border-line'}`} />)}
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-sm"><span className="font-medium">Size</span><a href="#" className="text-ink-muted underline underline-offset-4">Bảng size</a></div>
                <div className="flex flex-wrap gap-2">
                  {[['S', true], ['M', true], ['L', true], ['XL', false]].map(([s, ok], i) => (
                    <button key={String(s)} disabled={!ok} className={`h-10 min-w-12 rounded-md border px-3 text-sm transition-colors ${i === 1 ? 'border-ink bg-ink text-paper' : 'border-line bg-surface hover:border-ink'} disabled:border-dashed disabled:text-ink-muted/60 disabled:line-through disabled:hover:border-line`}>{String(s)}</button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-warn">Chỉ còn 3 sản phẩm size M</p>
              </div>
              <div className="flex gap-3">
                <div className="inline-flex h-12 items-center rounded-md border border-line bg-surface">
                  <button className="grid size-12 place-items-center text-ink-soft hover:text-ink" aria-label="Giảm"><Icon d={icons.minus} className="size-4" /></button>
                  <span className="w-8 text-center text-sm tabular-nums">1</span>
                  <button className="grid size-12 place-items-center text-ink-soft hover:text-ink" aria-label="Tăng"><Icon d={icons.plus} className="size-4" /></button>
                </div>
                <Button variant="primary" size="lg" className="flex-1">Thêm vào giỏ</Button>
              </div>
            </div>
          </div>
        </Section>

        {/* ───────── Cart & checkout ───────── */}
        <Section id="cart" title="Giỏ hàng & thanh toán">
          <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
            <div className="space-y-6">
              <ul className="divide-y divide-line rounded-card border border-line bg-surface">
                {[
                  { n: 'Áo sơ mi Oxford trắng dáng regular', v: 'Trắng · M', p: 499000, q: 1, t: 'bg-[#ece7dc]' },
                  { n: 'Quần chinos be dáng slim taper', v: 'Be · 31', p: 549000, q: 2, t: 'bg-[#dcd3c0]' },
                ].map((i) => (
                  <li key={i.n} className="flex gap-4 p-4">
                    <div className={`size-20 shrink-0 rounded-md ${i.t}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{i.n}</p>
                      <p className="text-xs text-ink-muted">{i.v}</p>
                      <div className="mt-3 inline-flex h-8 items-center rounded-md border border-line">
                        <button className="grid size-8 place-items-center text-ink-soft" aria-label="Giảm"><Icon d={icons.minus} className="size-3.5" /></button>
                        <span className="w-6 text-center text-sm tabular-nums">{i.q}</span>
                        <button className="grid size-8 place-items-center text-ink-soft" aria-label="Tăng"><Icon d={icons.plus} className="size-3.5" /></button>
                      </div>
                    </div>
                    <div className="flex flex-col items-end justify-between">
                      <Price value={i.p * i.q} />
                      <button className="text-ink-muted hover:text-sale" aria-label="Xoá"><Icon d={icons.trash} className="size-4" /></button>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="space-y-4 rounded-card border border-line bg-surface p-5">
                <h3 className="font-display text-lg">Thông tin nhận hàng</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Họ và tên"><Input placeholder="Nguyễn Văn A" /></Field>
                  <Field label="Số điện thoại" hint="Dùng để tra cứu đơn hàng"><Input placeholder="09xx xxx xxx" inputMode="tel" /></Field>
                </div>
                <Field label="Địa chỉ"><Input placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành" /></Field>
                <fieldset className="space-y-2">
                  <legend className="mb-1 text-sm font-medium">Phương thức thanh toán</legend>
                  {[['Thanh toán khi nhận hàng (COD)', true], ['Thanh toán online (giả lập)', false]].map(([label, on]) => (
                    <label key={String(label)} className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm ${on ? 'border-brand bg-brand-soft/50' : 'border-line'}`}>
                      <input type="radio" name="pay" defaultChecked={Boolean(on)} className="accent-[var(--color-brand)]" />{String(label)}
                    </label>
                  ))}
                </fieldset>
              </div>
            </div>

            <aside className="h-fit space-y-3 rounded-card border border-line bg-surface p-5 shadow-card lg:sticky lg:top-24">
              <h3 className="font-display text-lg">Tóm tắt đơn hàng</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-ink-soft">Tạm tính</dt><dd className="tabular-nums">1.597.000₫</dd></div>
                <div className="flex justify-between"><dt className="text-ink-soft">Phí giao hàng</dt><dd className="tabular-nums text-brand">Miễn phí</dd></div>
                <div className="flex justify-between border-t border-line pt-3 text-base font-semibold"><dt>Tổng cộng</dt><dd className="tabular-nums">1.597.000₫</dd></div>
              </dl>
              <Button variant="brand" size="lg" className="w-full">Đặt hàng</Button>
              <p className="text-center text-xs text-ink-muted">Giá và tồn kho được kiểm tra lại khi đặt hàng.</p>
            </aside>
          </div>
        </Section>

        {/* ───────── Admin ───────── */}
        <Section id="admin" title="Admin" note="Cùng token màu, mật độ thông tin dày hơn">
          <div className="grid overflow-hidden rounded-card border border-line bg-surface md:grid-cols-[200px_1fr]">
            <nav className="border-b border-line bg-sand/60 p-3 md:border-b-0 md:border-r">
              <p className="px-3 pb-2 pt-1 font-display text-sm font-semibold tracking-[0.18em]">TOMODEV</p>
              {['Danh mục', 'Sản phẩm', 'Đơn hàng', 'Duyệt yêu cầu', 'Knowledge'].map((item, i) => (
                <a key={item} href="#" className={`block rounded-md px-3 py-2 text-sm ${i === 1 ? 'bg-surface font-medium text-ink shadow-sm' : 'text-ink-soft hover:bg-surface/70'}`}>{item}</a>
              ))}
            </nav>
            <div className="min-w-0 p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-display text-xl">Sản phẩm</h3>
                <div className="flex gap-2"><Input placeholder="Tìm theo tên, SKU…" className="w-56" /><Button variant="primary">+ Thêm sản phẩm</Button></div>
              </div>
              <div className="overflow-x-auto rounded-md border border-line">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="bg-sand/60 text-xs uppercase tracking-wider text-ink-muted">
                    <tr><th className="px-4 py-2.5 font-medium">Sản phẩm</th><th className="px-4 py-2.5 font-medium">Danh mục</th><th className="px-4 py-2.5 text-right font-medium">Giá</th><th className="px-4 py-2.5 text-right font-medium">Tồn kho</th><th className="px-4 py-2.5 font-medium">Trạng thái</th><th /></tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {[
                      ['Áo sơ mi Oxford trắng', 'SM-001', 'Áo sơ mi', 499000, 42, 'brand', 'Đang bán'],
                      ['Quần jeans slim fit', 'QT-005', 'Quần', 413400, 4, 'warn', 'Sắp hết'],
                      ['Áo khoác bomber đen', 'JK-001', 'Áo khoác', 899000, 0, 'neutral', 'Hết hàng'],
                      ['Áo polo dệt kim be', 'PL-004', 'Áo polo', 469000, 18, 'neutral', 'Nháp'],
                    ].map(([n, sku, cat, price, stock, tone, label]) => (
                      <tr key={String(sku)} className="hover:bg-paper">
                        <td className="px-4 py-3"><p className="font-medium">{String(n)}</p><p className="text-xs text-ink-muted">{String(sku)}</p></td>
                        <td className="px-4 py-3 text-ink-soft">{String(cat)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{Number(price).toLocaleString('vi-VN')}₫</td>
                        <td className="px-4 py-3 text-right tabular-nums">{String(stock)}</td>
                        <td className="px-4 py-3"><Badge tone={tone as 'brand' | 'warn' | 'neutral'}>{String(label)}</Badge></td>
                        <td className="px-4 py-3 text-right"><a href="#" className="text-sm text-brand hover:underline">Sửa</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="primary">Lưu</Button><Button variant="outline">Huỷ</Button><Button variant="ghost">Xem trước</Button><Button variant="danger">Xoá</Button>
              </div>
            </div>
          </div>
        </Section>

        {/* ───────── Tokens ───────── */}
        <Section id="tokens" title="Màu & chữ" note="Định nghĩa trong src/app/globals.css (@theme)">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {swatches.map(([name, cls]) => (
              <div key={name}><div className={`h-14 rounded-md border border-line ${cls}`} /><p className="mt-1.5 text-xs text-ink-soft">{name}</p></div>
            ))}
          </div>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <p className="font-display text-4xl tracking-tight">Aa — Display serif</p>
              <p className="font-display text-2xl">Tiêu đề trang, tên sản phẩm lớn</p>
              <p className="text-sm text-ink-muted">font-display · chỉ dùng cho H1–H3, logo</p>
            </div>
            <div className="space-y-2">
              <p className="text-base">Aa — Sans body: nội dung, form, bảng, nút.</p>
              <p className="text-sm text-ink-soft">Văn bản phụ, mô tả ngắn, nhãn trường.</p>
              <p className="text-xs uppercase tracking-wider text-ink-muted">Nhãn nhỏ · category · metadata</p>
            </div>
          </div>
        </Section>
      </main>

      <footer className="mt-10 border-t border-line bg-sand/50 py-10 text-center text-xs text-ink-muted">© Tomodev Fashion · trang này chỉ để xem trước giao diện</footer>
    </div>
  );
}
