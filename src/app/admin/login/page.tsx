'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    const response = await fetch('/api/admin/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
    if (response.ok) router.push('/admin/knowledge');
    else setError((await response.json()).error ?? 'Không thể đăng nhập.');
  }
  return <main className="mx-auto mt-24 max-w-sm rounded-xl bg-white p-6 shadow-sm">
    <h1 className="text-xl font-semibold">Đăng nhập quản trị</h1>
    <form className="mt-5 space-y-3" onSubmit={submit}>
      <input className="w-full rounded border p-2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mật khẩu" autoFocus />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button className="w-full rounded bg-stone-900 p-2 text-white">Đăng nhập</button>
    </form>
  </main>;
}
