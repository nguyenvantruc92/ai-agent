'use client';

import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChatProductCards } from '@/components/shop/chat-product-cards';
import { useCooldown } from '@/components/shop/use-cooldown';
import { retryAfterOf } from '@/lib/shop-client';
import type { StoreCard } from '@/features/catalog/queries';

type Source = { id: string; title: string; type: string };
type Message = { role: 'user' | 'assistant'; answer: string; sources?: Source[]; products?: StoreCard[]; checking?: boolean; status?: string; insufficient?: boolean; traceId?: string; kind?: string; confirmationId?: string };
type Pending = { id: string; summary?: string } | null;
/** A checkout/cancel the customer must confirm with the buttons under the matching message. */
type Confirmation = { id: string; action?: 'checkout' | 'cancel_order'; summary?: string; details?: string[] } | null;
type ThreadResponse = { threadId: string; pendingApproval: Pending; pendingConfirmation: Confirmation; messages: Message[] };

const threadKey = 'fashion-tomodev-thread';
const readThread = () => { try { return localStorage.getItem(threadKey) ?? undefined; } catch { return undefined; } };
const writeThread = (id: string | undefined) => { try { if (id) localStorage.setItem(threadKey, id); else localStorage.removeItem(threadKey); } catch { /* storage unavailable */ } };

const suggestions = [
  'Có áo sơ mi trắng nào dưới 500.000đ không?',
  'Chính sách đổi trả như thế nào?',
  'Phí giao hàng là bao nhiêu?',
  'Tôi muốn mua một chiếc áo polo trắng size M',
  'Đơn FT-2026-1001 áo bị rộng, tôi muốn đổi size L',
];

/** Turns paths the assistant mentions (order page, cart, checkout) into links. */
function Linkified({ text }: { text: string }) {
  return <>{text.split(/(\/orders\/FT-\d{4}-\d{4}|\/cart\b|\/checkout\b)/).map((part, index) => index % 2 ? <Link key={index} href={part} className="font-medium text-brand underline underline-offset-2">{part}</Link> : part)}</>;
}

/** Products shown as boxes are not repeated in the source list. */
const sourcesBesidesProducts = (item: Message) => (item.sources ?? []).filter((source) => !(item.products?.length && source.type === 'product'));

/** The "please confirm" message: a heading line followed by "• ..." detail lines, shown as a small receipt. */
function ConfirmationCard({ text }: { text: string }) {
  const [heading, ...rest] = text.split('\n');
  return (
    <div>
      <p className="leading-6 font-medium">{heading}</p>
      <ul className="mt-2 space-y-1 rounded-xl bg-sand/60 p-3 text-[13px] leading-5 text-ink-soft">
        {rest.map((line, index) => <li key={index}>{line.replace(/^•\s*/, '')}</li>)}
      </ul>
    </div>
  );
}

/** Chat conversation: streaming answers, sources, and the staff-approval wait state. Mounted by ChatWidget on first open. */
export function ChatPanel({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState('');
  const [threadId, setThreadId] = useState<string>();
  const [pending, setPending] = useState(false);
  // After a 429 the send button stays locked and counts down; the server refuses until the window ends anyway.
  const cooldown = useCooldown();
  const [approval, setApproval] = useState<Pending>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const router = useRouter();
  const controller = useRef<AbortController | undefined>(undefined);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const loadThread = useCallback(async (id: string) => {
    const response = await fetch(`/api/chat/threads/${id}`);
    if (!response.ok) { writeThread(undefined); setThreadId(undefined); return; }
    const data = await response.json() as ThreadResponse;
    setThreadId(data.threadId);
    setMessages(data.messages);
    setApproval(data.pendingApproval);
    setConfirmation(data.pendingConfirmation);
  }, []);

  useEffect(() => {
    const saved = readThread();
    const timer = setTimeout(() => { if (saved) void loadThread(saved); input.current?.focus(); }, 0);
    return () => clearTimeout(timer);
  }, [loadThread]);

  // While a request waits for staff approval, poll until the resumed answer is stored.
  useEffect(() => {
    if (!approval || !threadId) return;
    const timer = setInterval(() => void loadThread(threadId), 3_000);
    return () => clearInterval(timer);
  }, [approval, threadId, loadThread]);

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }); }, [messages, approval, confirmation]);

  function newConversation() {
    controller.current?.abort();
    writeThread(undefined);
    setThreadId(undefined); setMessages([]); setApproval(null); setConfirmation(null); setPending(false);
    input.current?.focus();
  }

  /** Streams one server-sent turn into the last (assistant) message. Shared by typed messages and the confirmation buttons. */
  async function stream(open: (signal: AbortSignal) => Promise<Response>) {
    setPending(true);
    controller.current = new AbortController();
    const updateLast = (update: Partial<Message>) => setMessages((current) => current.map((item, index) => index === current.length - 1 ? { ...item, ...update } : item));
    try {
      const response = await open(controller.current.signal);
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({})) as { error?: string; traceId?: string };
        updateLast({ answer: data.error ?? 'Không thể kết nối chat.', checking: false, traceId: data.traceId });
        cooldown.start(retryAfterOf(response, data));
        if (threadId) void loadThread(threadId); // a conflict usually means the buttons are stale
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n'); buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const type = frame.match(/^event:\s*(.+)$/m)?.[1];
          const raw = frame.match(/^data:\s*(.+)$/m)?.[1];
          if (!type || !raw) continue;
          const data = JSON.parse(raw) as Record<string, unknown>;
          if (type === 'start') { setThreadId(data.threadId as string); writeThread(data.threadId as string); }
          if (type === 'status') updateLast({ status: data.status as string });
          if (type === 'partial') updateLast({ answer: data.answer as string, checking: true });
          if (type === 'complete') {
            const asked = data.pendingConfirmation as Confirmation;
            updateLast({
              answer: data.answer as string, sources: data.sources as Source[], products: (data.products as StoreCard[] | undefined) ?? [], insufficient: data.insufficientInformation as boolean, traceId: data.traceId as string, checking: false, status: undefined,
              kind: data.pendingApproval ? 'approval_pending' : asked ? 'confirmation_pending' : data.unavailable ? 'unavailable' : undefined, confirmationId: asked?.id,
            });
            if (data.pendingApproval) setApproval(data.pendingApproval as Pending);
            setConfirmation(asked ?? null);
            // The cart badge in the header is rendered on the server: refresh it after a cart/order tool ran.
            if (data.refresh) router.refresh();
          }
          if (type === 'error') updateLast({ answer: data.message as string, checking: false, status: undefined, traceId: data.traceId as string });
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') updateLast({ answer: 'Kết nối chat bị lỗi. Vui lòng thử lại.', checking: false });
      else updateLast({ checking: false, status: undefined, answer: '(Đã dừng)' });
    } finally { setPending(false); controller.current = undefined; }
  }

  async function send(question: string) {
    if (!question || pending || approval || confirmation || cooldown.active) return;
    setMessage('');
    setMessages((current) => [...current, { role: 'user', answer: question }, { role: 'assistant', answer: '', checking: true }]);
    await stream((signal) => fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ threadId, message: question }), signal }));
  }

  /** Xác nhận / Huỷ: only this click (an authenticated request from the customer's browser) can confirm a checkout or cancellation. */
  async function decide(decision: 'confirm' | 'cancel') {
    if (!confirmation || pending) return;
    const id = confirmation.id;
    setConfirmation(null);
    setMessages((current) => [...current, { role: 'user', answer: decision === 'confirm' ? 'Xác nhận' : 'Huỷ' }, { role: 'assistant', answer: '', checking: true, status: decision === 'confirm' ? 'Đang xử lý…' : undefined }]);
    await stream((signal) => fetch(`/api/chat/confirmations/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision }), signal }));
  }

  /** On a phone the chat covers the whole screen, so minimise it to let the product page show; on desktop it stays beside the page. */
  function openedProduct() { if (window.matchMedia('(max-width: 639px)').matches) onClose(); }

  function submit(event: FormEvent) { event.preventDefault(); void send(message.trim()); }
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(message.trim()); }
  }

  const locked = pending || Boolean(approval) || Boolean(confirmation) || cooldown.active;
  return (
    <>
      <header className="flex items-center gap-3 bg-gradient-to-r from-brand to-accent px-4 py-3 text-white">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/20 text-lg ring-1 ring-white/30" aria-hidden>✦</span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-bold">Trợ lý Tomodev</h2>
          <p className="flex items-center gap-1.5 text-xs text-white/85"><span className="size-1.5 rounded-full bg-emerald-300" aria-hidden />Tư vấn sản phẩm, đơn hàng, đổi/trả</p>
        </div>
        <button type="button" onClick={newConversation} title="Cuộc trò chuyện mới" aria-label="Cuộc trò chuyện mới" className="grid size-8 place-items-center rounded-full hover:bg-white/20">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-[18px]" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <button type="button" onClick={onClose} title="Thu nhỏ" aria-label="Đóng khung chat" className="grid size-8 place-items-center rounded-full hover:bg-white/20">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="size-[18px]" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </header>

      <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto bg-sand/40 p-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="pt-2">
            <div className="rounded-2xl rounded-tl-sm bg-white p-3.5 text-sm leading-6 text-ink shadow-sm ring-1 ring-line">Xin chào! Mình có thể giúp bạn chọn sản phẩm, tư vấn size, giải đáp chính sách, tra đơn hoặc đổi size/trả hàng.</div>
            <p className="mt-4 mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">Gợi ý</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((text) => <button key={text} type="button" disabled={locked} onClick={() => void send(text)} className="rounded-full border border-line bg-white px-3 py-1.5 text-left text-xs text-ink-soft hover:border-brand hover:text-brand disabled:opacity-50">{text}</button>)}
            </div>
          </div>
        )}
        {messages.map((item, index) => (
          <div key={index} className={`flex ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <article className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm ${item.role === 'user' ? 'rounded-br-sm bg-gradient-to-br from-brand to-[#9333ea] text-white' : item.kind === 'approval_pending' || item.kind === 'unavailable' ? 'rounded-tl-sm border border-amber-300 bg-amber-50 text-ink' : item.kind === 'confirmation_pending' ? 'w-full rounded-tl-sm border-2 border-brand/30 bg-white text-ink shadow-sm' : 'rounded-tl-sm bg-white text-ink shadow-sm ring-1 ring-line'}`}>
              {item.kind === 'confirmation_pending' ? <ConfirmationCard text={item.answer} /> : <p className="leading-6 whitespace-pre-wrap">{item.role === 'assistant' && item.answer ? <Linkified text={item.answer} /> : item.answer || item.status || 'Đang trả lời…'}</p>}
              {item.kind === 'confirmation_pending' && confirmation && item.confirmationId === confirmation.id && (
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={pending} onClick={() => void decide('confirm')} className="h-9 flex-1 rounded-lg bg-brand px-3 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50">Xác nhận</button>
                  <button type="button" disabled={pending} onClick={() => void decide('cancel')} className="h-9 flex-1 rounded-lg border border-line bg-white px-3 text-sm font-medium text-ink-soft hover:bg-sand disabled:opacity-50">Huỷ</button>
                </div>
              )}
              {item.products?.length ? <ChatProductCards products={item.products} onOpen={openedProduct} /> : null}
              {item.checking && <p className="mt-1.5 text-xs text-brand">{item.answer && item.status ? item.status : 'Đang kiểm tra nguồn…'}</p>}
              {sourcesBesidesProducts(item).length ? (
                <details className="mt-2 border-t border-line pt-2 text-xs text-ink-soft">
                  <summary className="cursor-pointer font-medium select-none">Nguồn ({sourcesBesidesProducts(item).length})</summary>
                  <ul className="mt-1 space-y-0.5">{sourcesBesidesProducts(item).map((source) => <li key={source.id}>{source.title}</li>)}</ul>
                </details>
              ) : null}
              {item.traceId && <p className="mt-1.5 text-[10px] text-ink-muted">Trace: {item.traceId}</p>}
            </article>
          </div>
        ))}
        {approval && <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900">Đang chờ nhân viên duyệt{approval.summary ? `: ${approval.summary}` : ''}. Kết quả sẽ hiện ở đây.</p>}
      </div>

      <form onSubmit={submit} className="border-t border-line bg-white p-3">
        <div className="flex items-end gap-2">
          <textarea ref={input} rows={1} maxLength={2000} value={message} disabled={Boolean(approval) || Boolean(confirmation)} onChange={(e) => setMessage(e.target.value)} onKeyDown={onKeyDown} aria-label="Tin nhắn" placeholder={approval ? 'Đang chờ nhân viên duyệt…' : confirmation ? 'Hãy bấm Xác nhận hoặc Huỷ ở trên…' : cooldown.active ? `Bạn gửi hơi nhanh, thử lại sau ${cooldown.remaining} giây…` : 'Nhập câu hỏi của bạn…'} className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-line bg-sand/50 px-3 py-2 text-sm placeholder:text-ink-muted focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/20 focus:outline-none disabled:bg-sand" />
          {pending
            ? <button type="button" onClick={() => controller.current?.abort()} className="h-10 shrink-0 rounded-xl border border-line px-3 text-sm font-medium text-ink-soft hover:bg-sand">Dừng</button>
            : <button disabled={locked || !message.trim()} aria-label="Gửi" className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-white hover:bg-brand-hover disabled:opacity-40">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-[18px]" aria-hidden><path d="m5 12 14-7-5 14-2.5-5.5L5 12Z" /></svg>
              </button>}
        </div>
        {cooldown.active && <p role="status" className="mt-1.5 text-center text-xs font-medium text-amber-700">Bạn gửi hơi nhanh. Có thể gửi lại sau {cooldown.remaining} giây.</p>}
        <p className="mt-1.5 text-center text-[10px] text-ink-muted">Enter để gửi · Shift+Enter xuống dòng · Trợ lý AI có thể nhầm, hãy kiểm tra thông tin quan trọng.</p>
      </form>
    </>
  );
}
