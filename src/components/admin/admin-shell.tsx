'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AdminThemeProvider, useAdminTheme } from '@/components/admin/admin-theme';
import { LogoMark } from '@/components/brand/logo';
import { FeedbackProvider } from '@/components/admin/feedback';
import { SyncPill } from '@/components/admin/sync-pill';
import { Avatar, AvatarFallback } from '@/components/admin-ui/avatar';
import { Button } from '@/components/admin-ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/admin-ui/dropdown';
import { GearIcon, ChatIcon, ChevronDownIcon, DatabaseIcon, LayoutGridIcon, LogOutIcon, MenuTwoIcon, MoonIcon, MovingBoxIcon, PlugIcon, SparkleIcon, SunIcon, TagIcon, TaskIcon, XIcon, BoxIcon, CartIcon } from '@/components/admin-ui/icons';
import type { SyncState } from '@/features/catalog/dashboard';
import { cn } from '@/lib/cn';

type Item = { href: string; label: string; icon: React.ReactNode; badge?: number; soon?: boolean };
const sidebarKey = 'admin-sidebar-collapsed';

function ThemeToggle() {
  const { theme, toggle } = useAdminTheme();
  return <Button variant="outline" size="icon-sm" onClick={toggle} aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}>{theme === 'dark' ? <SunIcon /> : <MoonIcon />}</Button>;
}

function UserMenu() {
  const router = useRouter();
  async function logout() { await fetch('/api/admin/session', { method: 'DELETE' }); router.push('/admin/login'); }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-3 rounded-lg p-1 text-start outline-hidden focus-visible:ring-3 focus-visible:ring-brand-500/20">
        <Avatar size="sm"><AvatarFallback className="bg-brand-50 font-medium text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">A</AvatarFallback></Avatar>
        <span className="hidden sm:block"><span className="block text-sm font-medium text-gray-800 dark:text-white/90">Quản trị viên</span><span className="block text-xs text-gray-500 dark:text-gray-400">Tomodev Fashion</span></span>
        <ChevronDownIcon className="hidden size-5 text-gray-500 sm:block dark:text-gray-400" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="px-3 py-2 text-xs font-normal text-gray-500 dark:text-gray-400">Đăng nhập với quyền quản trị</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => router.push('/chat')}><ChatIcon />Mở khung chat</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => void logout()}><LogOutIcon />Đăng xuất</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Shell({ pendingApprovals, processingOrders, sync, children }: { pendingApprovals: number; processingOrders: number; sync: SyncState; children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const wide = !collapsed || hovered || mobileOpen;

  useEffect(() => {
    const timer = setTimeout(() => { try { setCollapsed(localStorage.getItem(sidebarKey) === '1'); } catch { /* storage unavailable */ } }, 0);
    return () => clearTimeout(timer);
  }, []);
  // Close the drawer after navigating (adjusting state during render avoids an extra effect pass).
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) { setSeenPath(pathname); setMobileOpen(false); }

  function toggleSidebar() {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      setCollapsed((current) => { try { localStorage.setItem(sidebarKey, current ? '0' : '1'); } catch { /* storage unavailable */ } return !current; });
    } else setMobileOpen((current) => !current);
  }

  const groups: { title: string; items: Item[] }[] = [
    { title: 'Tổng quan', items: [{ href: '/admin', label: 'Dashboard', icon: <LayoutGridIcon /> }] },
    { title: 'Cửa hàng', items: [
      { href: '/admin/products', label: 'Sản phẩm', icon: <BoxIcon /> },
      { href: '/admin/categories', label: 'Danh mục', icon: <TagIcon /> },
      { href: '/admin/orders', label: 'Đơn hàng', icon: <CartIcon />, badge: processingOrders },
    ] },
    { title: 'AI', items: [
      { href: '/admin/agents', label: 'AI Agents', icon: <SparkleIcon /> },
      { href: '/admin/knowledge', label: 'Knowledge', icon: <DatabaseIcon /> },
      { href: '/admin/mcp-servers', label: 'MCP Server', icon: <PlugIcon /> },
      { href: '/admin/approvals', label: 'Phê duyệt', icon: <TaskIcon />, badge: pendingApprovals },
      { href: '/admin/monitoring', label: 'Monitoring', icon: <LayoutGridIcon /> },
    ] },
    { title: 'Hệ thống', items: [{ href: '/admin/settings', label: 'Cài đặt', icon: <GearIcon /> }] },
  ];
  const isActive = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 dark:bg-gray-950 dark:text-gray-300">
      <aside onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        className={cn('fixed inset-y-0 left-0 z-99999 flex flex-col border-r border-gray-200 bg-white px-5 transition-all duration-300 ease-in-out dark:border-gray-800 dark:bg-gray-900',
          wide ? 'w-72.5' : 'w-22.5', mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0')}>
        <Link href="/admin" className={cn('flex items-center gap-3 py-8', !wide && 'lg:justify-center')}>
          <LogoMark className="size-10 shrink-0" />
          {wide && <span className="leading-tight"><span className="block font-display text-lg font-semibold tracking-[0.14em] text-gray-800 dark:text-white/90">TOMODEV</span><span className="block text-xs text-gray-500 dark:text-gray-400">Quản trị cửa hàng</span></span>}
        </Link>
        <nav aria-label="Quản trị" className="custom-scrollbar flex-1 space-y-6 overflow-y-auto pb-6">
          {groups.map((group) => (
            <div key={group.title}>
              <h2 className={cn('mb-3 text-xs leading-5 text-gray-400 uppercase', !wide && 'text-center')}>{wide ? group.title : '•••'}</h2>
              <ul className="flex flex-col gap-1">
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  const content = (
                    <>
                      <span className={cn('[&_svg]:size-6', active ? 'menu-item-icon-active' : 'menu-item-icon-inactive')}>{item.icon}</span>
                      {wide && <span>{item.label}</span>}
                      {wide && item.soon && <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500 dark:bg-white/5 dark:text-gray-400">Sắp có</span>}
                      {item.badge ? <span className={cn('grid min-w-5 place-items-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white', wide ? 'ml-auto' : 'absolute top-1 right-1')}>{item.badge}</span> : null}
                    </>
                  );
                  return (
                    <li key={item.href}>
                      {item.soon
                        ? <span className={cn('group menu-item menu-item-inactive cursor-not-allowed opacity-60', !wide && 'lg:justify-center')} title="Có ở giai đoạn sau">{content}</span>
                        : <Link href={item.href} aria-current={active ? 'page' : undefined} title={wide ? undefined : item.label} className={cn('group menu-item', active ? 'menu-item-active' : 'menu-item-inactive', !wide && 'lg:justify-center')}>{content}</Link>}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        {wide && (
          <div className="mb-5 rounded-2xl bg-gray-50 px-4 py-5 dark:bg-white/3">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white/90"><MovingBoxIcon className="size-5" />Trợ lý AI</p>
            <SyncPill sync={sync} />
            <p className="mt-3 text-theme-xs text-gray-500 dark:text-gray-400">Sửa sản phẩm hoặc danh mục thì chatbot tự cập nhật lại.</p>
          </div>
        )}
      </aside>
      {mobileOpen && <div className="fixed inset-0 z-99998 bg-gray-900/50 lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden />}

      <div className={cn('transition-all duration-300 ease-in-out', collapsed ? 'lg:ml-22.5' : 'lg:ml-72.5')}>
        <header className="sticky top-0 z-99 flex items-center gap-3 border-b border-gray-200 bg-white px-3 py-2 sm:px-6 dark:border-gray-800 dark:bg-gray-900">
          <Button variant="outline" size="icon-sm" className="text-gray-500 dark:text-gray-400" onClick={toggleSidebar} aria-label="Bật/tắt menu">{mobileOpen ? <XIcon className="size-5" /> : <MenuTwoIcon />}</Button>
          <p className="hidden text-sm text-gray-500 sm:block dark:text-gray-400">Tomodev Fashion</p>
          <div className="ml-auto flex items-center gap-3"><div className="hidden md:block"><SyncPill sync={sync} /></div><ThemeToggle /><UserMenu /></div>
        </header>
        <div className="w-full max-w-[2000px] p-4 md:p-6">{children}</div>
      </div>
    </div>
  );
}

export function AdminShell(props: { pendingApprovals: number; processingOrders: number; sync: SyncState; children: React.ReactNode }) {
  return <AdminThemeProvider><FeedbackProvider><Shell {...props} /></FeedbackProvider></AdminThemeProvider>;
}
