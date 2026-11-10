import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { themeBootScript } from '@/components/admin/admin-theme';
import { AdminShell } from '@/components/admin/admin-shell';
import { adminCookie, isAdminSession } from '@/features/auth/session';
import { getShellStatus } from '@/features/catalog/dashboard';

export const dynamic = 'force-dynamic';

/** Server-side guard for every /admin page except /admin/login. */
export default async function ProtectedAdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const jar = await cookies();
  if (!isAdminSession(jar.get(adminCookie)?.value)) redirect('/admin/login');
  const status = await getShellStatus();
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      <AdminShell pendingApprovals={status.pendingApprovals} processingOrders={status.processingOrders} sync={status.sync}>{children}</AdminShell>
    </>
  );
}
