'use client';

import { useEffect, useRef, useState } from 'react';
import { ChatPanel } from '@/components/shop/chat-panel';

export const OPEN_CHAT_EVENT = 'tomodev:open-chat';
const openKey = 'fashion-tomodev-chat-open';

/** Floating chat launcher + panel, mounted once in the shop layout so the conversation survives page navigation. */
export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false); // panel is created on first open, then kept alive (streams continue when minimised)
  const launcher = useRef<HTMLButtonElement>(null);

  function show(next: boolean) {
    setOpen(next);
    if (next) setMounted(true);
    try { sessionStorage.setItem(openKey, next ? '1' : '0'); } catch { /* storage unavailable */ }
    if (!next) launcher.current?.focus();
  }

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('chat') === '1';
    let remembered = false;
    try { remembered = sessionStorage.getItem(openKey) === '1'; } catch { /* storage unavailable */ }
    if (fromUrl) {
      const url = new URL(window.location.href);
      url.searchParams.delete('chat');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    const timer = setTimeout(() => { if (fromUrl || remembered) { setOpen(true); setMounted(true); } }, 0);
    const onOpen = () => { setOpen(true); setMounted(true); try { sessionStorage.setItem(openKey, '1'); } catch { /* storage unavailable */ } };
    window.addEventListener(OPEN_CHAT_EVENT, onOpen);
    return () => { clearTimeout(timer); window.removeEventListener(OPEN_CHAT_EVENT, onOpen); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') show(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {mounted && (
        <section
          role="dialog"
          aria-label="Trợ lý Tomodev"
          hidden={!open}
          className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-white sm:inset-auto sm:right-5 sm:bottom-24 sm:h-[600px] sm:max-h-[calc(100vh-7.5rem)] sm:w-[390px] sm:rounded-2xl sm:shadow-[0_24px_60px_-12px_rgb(76_29_149/0.45)] sm:ring-1 sm:ring-line [&:not([hidden])]:animate-[chat-pop_.18s_ease-out]"
        >
          <ChatPanel onClose={() => show(false)} />
        </section>
      )}
      <button
        ref={launcher}
        type="button"
        onClick={() => show(!open)}
        aria-label={open ? 'Đóng khung chat' : 'Mở khung chat với trợ lý AI'}
        aria-expanded={open}
        className={`group fixed right-4 bottom-4 z-40 items-center gap-2 rounded-full bg-gradient-to-br from-brand to-accent p-4 text-white shadow-[0_10px_30px_-6px_rgb(124_58_237/0.6)] transition-transform hover:scale-105 sm:right-5 sm:bottom-5 ${open ? 'hidden sm:flex' : 'flex'}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden>
          {open ? <path d="m6 9 6 6 6-6" /> : <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12Z" />}
        </svg>
        {!open && <span className="hidden pr-1 text-sm font-semibold lg:inline">Chat với trợ lý</span>}
      </button>
    </>
  );
}

/** Any button/link that should open the widget (server components can render it). */
export function OpenChatButton({ className, children }: { className?: string; children: React.ReactNode }) {
  return <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(OPEN_CHAT_EVENT))}>{children}</button>;
}
