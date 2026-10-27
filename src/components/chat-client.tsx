'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

type Source = { id: string; title: string; type: string };
type Message = { role: 'user' | 'assistant'; answer: string; sources?: Source[]; checking?: boolean; status?: string; insufficient?: boolean; traceId?: string; kind?: string };
type Pending = { id: string; summary?: string } | null;
type ThreadResponse = { threadId: string; pendingApproval: Pending; messages: Message[] };

const threadKey = 'fashion-tomodev-thread';
const readThread = () => { try { return localStorage.getItem(threadKey) ?? undefined; } catch { return undefined; } };
const writeThread = (id: string | undefined) => { try { if (id) localStorage.setItem(threadKey, id); else localStorage.removeItem(threadKey); } catch { /* storage unavailable */ } };

export default function ChatClient() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState('');
  const [threadId, setThreadId] = useState<string>();
  const [pending, setPending] = useState(false);
  const [approval, setApproval] = useState<Pending>(null);
  const controller = useRef<AbortController | undefined>(undefined);

  const loadThread = useCallback(async (id: string) => {
    const response = await fetch(`/api/chat/threads/${id}`);
    if (!response.ok) { writeThread(undefined); setThreadId(undefined); return; }
    const data = await response.json() as ThreadResponse;
    setThreadId(data.threadId);
    setMessages(data.messages);
    setApproval(data.pendingApproval);
  }, []);

  useEffect(() => {
    const saved = readThread();
    const timer = setTimeout(() => { if (saved) void loadThread(saved); }, 0);
    return () => clearTimeout(timer);
  }, [loadThread]);

  // While a request waits for staff approval, poll until the resumed answer is stored.
  useEffect(() => {
    if (!approval || !threadId) return;
    const timer = setInterval(() => void loadThread(threadId), 3_000);
    return () => clearInterval(timer);
  }, [approval, threadId, loadThread]);

  function newConversation() {
    controller.current?.abort();
    writeThread(undefined);
    setThreadId(undefined); setMessages([]); setApproval(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const question = message.trim();
    if (!question || pending || approval) return;
    setMessage(''); setPending(true);
    setMessages((current) => [...current, { role: 'user', answer: question }, { role: 'assistant', answer: '', checking: true }]);
    controller.current = new AbortController();
    const updateLast = (update: Partial<Message>) => setMessages((current) => current.map((item, index) => index === current.length - 1 ? { ...item, ...update } : item));
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ threadId, message: question }), signal: controller.current.signal });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({})) as { error?: string; traceId?: string };
        updateLast({ answer: data.error ?? 'Không thể kết nối chat.', checking: false, traceId: data.traceId });
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
            updateLast({ answer: data.answer as string, sources: data.sources as Source[], insufficient: data.insufficientInformation as boolean, traceId: data.traceId as string, checking: false, status: undefined, kind: data.pendingApproval ? 'approval_pending' : undefined });
            if (data.pendingApproval) setApproval(data.pendingApproval as Pending);
          }
          if (type === 'error') updateLast({ answer: data.message as string, checking: false, status: undefined, traceId: data.traceId as string });
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') updateLast({ answer: 'Kết nối chat bị lỗi. Vui lòng thử lại.', checking: false });
    } finally { setPending(false); controller.current = undefined; }
  }

  const locked = pending || Boolean(approval);
  return <main className="flex min-h-screen flex-col bg-stone-50">
    <header className="border-b bg-white"><div className="mx-auto flex max-w-3xl items-center justify-between gap-4 p-4">
      <div><h1 className="font-semibold">Fashion Tomodev</h1><p className="text-xs text-stone-500">Tư vấn sản phẩm, chính sách, tra đơn và đổi/trả</p></div>
      <div className="flex gap-4 text-sm"><button className="underline" onClick={newConversation}>Cuộc trò chuyện mới</button><Link className="underline" href="/admin/knowledge">Quản trị</Link></div>
    </div></header>
    <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4">
      {messages.length === 0 && <div className="mt-16 rounded-xl border border-dashed bg-white p-6 text-center text-stone-600">Hỏi về sản phẩm, size, chính sách — hoặc tra đơn và yêu cầu đổi size/trả hàng, ví dụ “Đơn FT-2026-1001 áo sơ mi bị rộng, tôi muốn đổi size L”.</div>}
      {messages.map((item, index) => <article key={index} className={`max-w-[85%] rounded-xl px-4 py-3 ${item.role === 'user' ? 'ml-auto bg-stone-900 text-white' : item.kind === 'approval_pending' ? 'border border-amber-300 bg-amber-50' : 'bg-white shadow-sm'}`}>
        <p className="whitespace-pre-wrap text-sm leading-6">{item.answer || item.status || 'Đang trả lời…'}</p>
        {item.checking && <p className="mt-2 text-xs text-amber-700">{item.answer && item.status ? item.status : 'Đang kiểm tra nguồn…'}</p>}
        {item.sources?.length ? <div className="mt-3 border-t pt-2 text-xs text-stone-600"><p className="font-medium">Nguồn</p>{item.sources.map((source) => <p key={source.id}>{source.title} <span className="text-stone-400">({source.id})</span></p>)}</div> : null}
        {item.traceId && <p className="mt-2 text-[11px] text-stone-400">Trace: {item.traceId}</p>}
      </article>)}
      {approval && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Đang chờ nhân viên duyệt{approval.summary ? `: ${approval.summary}` : ''}. Kết quả sẽ hiện ở đây.</p>}
    </section>
    <form className="sticky bottom-0 border-t bg-white p-4" onSubmit={submit}><div className="mx-auto flex max-w-3xl gap-2">
      <textarea className="min-h-11 flex-1 resize-none rounded border p-2 disabled:bg-stone-100" maxLength={2000} value={message} disabled={Boolean(approval)} onChange={(e) => setMessage(e.target.value)} placeholder={approval ? 'Đang chờ nhân viên duyệt…' : 'Ví dụ: Có áo sơ mi trắng nào dưới 500.000đ không?'} />
      <button className="rounded bg-stone-900 px-4 text-sm text-white disabled:opacity-50" disabled={locked}>{pending ? 'Đang trả lời' : 'Gửi'}</button>
      {pending && <button type="button" className="rounded border px-3 text-sm" onClick={() => controller.current?.abort()}>Dừng</button>}
    </div></form>
  </main>;
}
