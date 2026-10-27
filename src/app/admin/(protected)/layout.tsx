import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { adminCookie, isAdminSession } from '@/features/auth/session';

/** Server-side guard for every /admin page except /admin/login. */
export default async function ProtectedAdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const jar = await cookies();
  if (!isAdminSession(jar.get(adminCookie)?.value)) redirect('/admin/login');
  return children;
}
