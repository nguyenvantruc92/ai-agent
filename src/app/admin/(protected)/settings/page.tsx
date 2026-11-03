import { SettingsForm } from '@/components/admin/settings-form';
import { getShopSettings } from '@/features/shop/settings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cài đặt · Admin' };

export default async function SettingsPage() {
  return <SettingsForm initial={await getShopSettings()} />;
}
