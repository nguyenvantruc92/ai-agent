'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/admin-ui/button';
import { AlertIcon, CheckIcon, XIcon } from '@/components/admin-ui/icons';

/* ───────── toasts ───────── */

type Tone = 'success' | 'error' | 'info';
type Toast = { id: number; tone: Tone; text: string };
const ToastContext = createContext<(tone: Tone, text: string) => void>(() => undefined);

/** `const toast = useToast(); toast('success', 'Đã lưu')`. Errors stay longer than confirmations. */
export const useToast = () => useContext(ToastContext);

/* ───────── confirm dialog ───────── */

type ConfirmOptions = { title: string; message?: string; confirmLabel?: string; danger?: boolean };
type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };
const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(() => Promise.resolve(false));

/** Replaces window.confirm: `if (await confirm({ title: 'Xóa?', danger: true })) …` */
export const useConfirm = () => useContext(ConfirmContext);

const toneColor: Record<Tone, string> = { success: 'text-green-500', error: 'text-red-500', info: 'text-brand-500' };

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<Pending>();
  const dialog = useRef<HTMLDialogElement>(null);
  const nextId = useRef(0);

  const toast = useCallback((tone: Tone, text: string) => {
    const id = (nextId.current += 1);
    setToasts((current) => [...current.slice(-3), { id, tone, text }]);
    setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), tone === 'error' ? 7000 : 3500);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })), []);
  const settle = useCallback((ok: boolean) => { pending?.resolve(ok); setPending(undefined); }, [pending]);

  // The native <dialog> gives focus trapping, Esc handling and a backdrop for free.
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (pending && !element.open) element.showModal();
    if (!pending && element.open) element.close();
  }, [pending]);

  return (
    <ToastContext.Provider value={toast}>
      <ConfirmContext.Provider value={confirm}>
        {children}
        <dialog ref={dialog} onCancel={(event) => { event.preventDefault(); settle(false); }} onClick={(event) => { if (event.target === dialog.current) settle(false); }}
          className="m-auto w-[min(92vw,26rem)] rounded-2xl border border-gray-200 bg-white p-0 text-gray-800 shadow-theme-xl backdrop:bg-gray-900/50 backdrop:backdrop-blur-[2px] dark:border-gray-800 dark:bg-gray-900 dark:text-white/90">
          {pending && (
            <div className="space-y-4 p-6">
              <div className="flex gap-3">
                <span className={`grid size-10 shrink-0 place-items-center rounded-full ${pending.danger ? 'bg-red-50 text-red-500 dark:bg-red-500/15' : 'bg-brand-50 text-brand-500 dark:bg-brand-500/15'}`}><AlertIcon className="size-5" /></span>
                <div><h2 className="text-lg font-semibold leading-snug">{pending.title}</h2>{pending.message && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{pending.message}</p>}</div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" autoFocus onClick={() => settle(false)}>Huỷ</Button>
                <Button variant={pending.danger ? 'destructive' : 'default'} onClick={() => settle(true)}>{pending.confirmLabel ?? 'Đồng ý'}</Button>
              </div>
            </div>
          )}
        </dialog>
        <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-999999 flex w-[min(92vw,22rem)] flex-col gap-2">
          {toasts.map((item) => (
            <div key={item.id} role={item.tone === 'error' ? 'alert' : 'status'} className="pointer-events-auto flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-theme-lg dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
              <span className={`mt-0.5 ${toneColor[item.tone]}`}>{item.tone === 'error' ? <AlertIcon className="size-5" /> : <CheckIcon className="size-5" />}</span>
              <span className="flex-1">{item.text}</span>
              <button aria-label="Đóng" className="text-gray-400 hover:text-gray-700 dark:hover:text-white" onClick={() => setToasts((current) => current.filter((t) => t.id !== item.id))}><XIcon className="size-4" /></button>
            </div>
          ))}
        </div>
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}
