'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Panel } from '@/components/admin/page-header';
import { Badge } from '@/components/admin-ui/badge';
import { Button } from '@/components/admin-ui/button';
import { Textarea } from '@/components/admin-ui/textarea';

type Source = { id: string; title: string; type: string };
type Message = { role: 'user' | 'assistant'; text: string; sources?: Source[]; tools?: string[]; trace?: string; status?: string; busy?: boolean; kind?: 'confirmation' | 'approval'; confirmationId?: string };
type Confirmation = { id: string } | null;

/** Talks to one specific agent through the normal /api/chat endpoint (admin session only), so what you see is what a customer would get. */
export function AgentTestChat({ agentId, agentName }: { agentId: string; agentName: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [threadId, setThreadId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [approval, setApproval] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | undefined>(undefined);

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }); }, [messages]);

  const reload = useCallback(async (id: string) => {
    const response = await fetch(`/api/chat/threads/${id}`);
    if (!response.ok) return;
    const data = await response.json() as { pendingApproval: { summary?: string } | null; pendingConfirmation: Confirmation; messages: { role: 'user' | 'assistant'; answer: string; sources?: Source[]; traceId?: string; kind?: string; confirmationId?: string }[] };
    setApproval(data.pendingApproval ? data.pendingApproval.summary ?? 'Đang chờ duyệt' : null);
    setConfirmation(data.pendingConfirmation);
    setMessages(data.messages.map((item) => ({ role: item.role, text: item.answer, sources: item.sources, trace: item.traceId, kind: item.kind === 'confirmation_pending' ? 'confirmation' : item.kind === 'approval_pending' ? 'approval' : undefined, confirmationId: item.confirmationId })));
  }, []);

  // While a request waits for staff, poll until the resumed answer is stored.
  useEffect(() => {
    if (!approval || !threadId) return;
    const timer = setInterval(() => void reload(threadId), 3_000);
    return () => clearInterval(timer);
  }, [approval, threadId, reload]);

  /** Reads one server-sent turn into the last (assistant) message. */
  async function stream(open: (signal: AbortSignal) => Promise<Response>) {
    setBusy(true);
    controller.current = new AbortController();
    const update = (patch: Partial<Message>) => setMessages((current) => current.map((item, index) => index === current.length - 1 ? { ...item, ...patch } : item));
    try {
      const response = await open(controller.current.signal);
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        update({ text: data.error ?? 'Không kết nối được chat.', busy: false });
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
          if (type === 'start') setThreadId(data.threadId as string);
          if (type === 'status') update({ status: data.status as string });
          if (type === 'complete') {
            const asked = data.pendingConfirmation as Confirmation;
            const waiting = data.pendingApproval as { summary?: string } | undefined;
            update({ text: data.answer as string, sources: data.sources as Source[], tools: data.toolCalls as string[] | undefined, trace: data.traceId as string, busy: false, status: undefined, kind: asked ? 'confirmation' : waiting ? 'approval' : undefined, confirmationId: asked?.id });
            setConfirmation(asked ?? null);
            setApproval(waiting ? waiting.summary ?? 'Đang chờ duyệt' : null);
          }
          if (type === 'error') update({ text: data.message as string, busy: false, status: undefined, trace: data.traceId as string });
        }
      }
    } catch (error) {
      update({ text: (error as Error).name === 'AbortError' ? '(Đã dừng)' : 'Kết nối chat bị lỗi.', busy: false, status: undefined });
    } finally { setBusy(false); controller.current = undefined; }
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const question = text.trim();
    if (!question || busy || approval || confirmation) return;
    setText('');
    setMessages((current) => [...current, { role: 'user', text: question }, { role: 'assistant', text: '', busy: true }]);
    await stream((signal) => fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ threadId, agentId, message: question }), signal }));
  }

  async function decide(decision: 'confirm' | 'cancel') {
    if (!confirmation || busy) return;
    const id = confirmation.id;
    setConfirmation(null);
    setMessages((current) => [...current, { role: 'user', text: decision === 'confirm' ? 'Xác nhận' : 'Huỷ' }, { role: 'assistant', text: '', busy: true }]);
    await stream((signal) => fetch(`/api/chat/confirmations/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision }), signal }));
  }

  function reset() { controller.current?.abort(); setMessages([]); setThreadId(undefined); setApproval(null); setConfirmation(null); setText(''); }

  return (
    <Panel title={`Chat thử với “${agentName}”`} action={<Button size="xs" variant="outline" onClick={reset} disabled={!messages.length && !threadId}>Cuộc trò chuyện mới</Button>}>
      <div className="space-y-3 px-5 pb-5 sm:px-6">
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-theme-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          Chat thử dùng dữ liệu thật: tool ghi (đặt hàng, hủy đơn, đổi/trả, tool MCP ngoài) vẫn chạy thật sau khi xác nhận hoặc duyệt. Lưu thay đổi của Agent trước khi thử.
        </p>
        <div ref={scroller} className="max-h-[28rem] min-h-40 space-y-3 overflow-y-auto rounded-xl bg-gray-50 p-4 dark:bg-white/3" aria-live="polite">
          {messages.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">Gửi một tin nhắn để thử. Bên dưới mỗi câu trả lời hiện các tool Agent đã gọi và nguồn trích dẫn.</p>}
          {messages.map((item, index) => (
            <div key={index} className={`flex ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <article className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-sm ${item.role === 'user' ? 'bg-brand-500 text-white' : 'border border-gray-200 bg-white text-gray-800 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90'}`}>
                <p className="leading-6 whitespace-pre-wrap">{item.text || item.status || (item.busy ? 'Đang trả lời…' : '')}</p>
                {item.busy && item.text && item.status && <p className="mt-1 text-theme-xs text-brand-500">{item.status}</p>}
                {item.kind === 'confirmation' && confirmation && item.confirmationId === confirmation.id && (
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" disabled={busy} onClick={() => void decide('confirm')}>Xác nhận</Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void decide('cancel')}>Huỷ</Button>
                  </div>
                )}
                {item.tools?.length ? <p className="mt-2 flex flex-wrap items-center gap-1.5 text-theme-xs text-gray-500">Tool đã gọi: {item.tools.map((tool, i) => <Badge key={`${tool}-${i}`} color="gray" size="sm">{tool}</Badge>)}</p> : null}
                {item.sources?.length ? <p className="mt-1.5 text-theme-xs text-gray-500">Nguồn: {item.sources.map((source) => source.id).join(', ')}</p> : null}
                {item.trace && <p className="mt-1 text-[10px] text-gray-400">Trace: {item.trace}</p>}
              </article>
            </div>
          ))}
          {approval && <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-theme-xs text-amber-900">Đang chờ nhân viên duyệt: {approval}. Duyệt tại <Link className="underline" href="/admin/approvals" target="_blank">trang Phê duyệt</Link>, kết quả sẽ hiện ở đây.</p>}
        </div>
        <form onSubmit={send} className="flex items-end gap-2">
          <Textarea rows={2} maxLength={2000} value={text} disabled={Boolean(approval) || Boolean(confirmation)} onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }}
            placeholder={approval ? 'Đang chờ nhân viên duyệt…' : confirmation ? 'Bấm Xác nhận hoặc Huỷ ở trên…' : 'Nhập câu hỏi để thử Agent…'} aria-label="Tin nhắn thử" />
          {busy ? <Button type="button" variant="outline" size="lg" onClick={() => controller.current?.abort()}>Dừng</Button> : <Button type="submit" size="lg" disabled={!text.trim() || Boolean(approval) || Boolean(confirmation)}>Gửi</Button>}
        </form>
      </div>
    </Panel>
  );
}
