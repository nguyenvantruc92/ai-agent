'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FormField } from '@/components/admin/form';
import { Button } from '@/components/admin-ui/button';
import { Input } from '@/components/admin-ui/input';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    const response = await fetch('/api/admin/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
    if (response.ok) router.push('/admin');
    else { setError((await response.json()).error ?? 'Không thể đăng nhập.'); setBusy(false); }
  }
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-2">
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-md space-y-6">
          <div>
            <span className="mb-6 grid size-12 place-items-center rounded-xl bg-brand-500 font-display text-xl font-semibold text-white">T</span>
            <h1 className="text-title-lg font-semibold text-gray-800">Đăng nhập quản trị</h1>
            <p className="mt-1.5 text-sm text-gray-500">Nhập mật khẩu quản trị để quản lý cửa hàng và trợ lý AI.</p>
          </div>
          <FormField label="Mật khẩu"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="current-password" required /></FormField>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <Button type="submit" size="sm" className="w-full" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</Button>
        </form>
      </div>
      <div className="relative hidden items-center justify-center overflow-hidden bg-brand-950 lg:flex">
        <div className="absolute -top-24 -right-24 size-96 rounded-full bg-brand-500/30 blur-3xl" aria-hidden />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-brand-700/40 blur-3xl" aria-hidden />
        <div className="relative max-w-sm px-8 text-center">
          <p className="font-display text-2xl font-semibold tracking-[0.2em] text-white">TOMODEV</p>
          <p className="mt-4 text-gray-400">Quản lý sản phẩm, theo dõi tồn kho và duyệt yêu cầu đổi/trả của khách tại một nơi.</p>
        </div>
      </div>
    </main>
  );
}
