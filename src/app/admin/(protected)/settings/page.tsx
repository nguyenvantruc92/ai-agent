import { OpenAiKeyForm } from '@/components/admin/openai-key-form';
import { SettingsForm } from '@/components/admin/settings-form';
import { openAiKeyStatus } from '@/features/settings/openai-key';
import { getShopSettings } from '@/features/shop/settings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cài đặt · Admin' };

export default async function SettingsPage() {
  const [shop, openAi] = await Promise.all([getShopSettings(), openAiKeyStatus()]);
  return (
    <div className="space-y-8">
      <SettingsForm initial={shop} />
      <OpenAiKeyForm initial={openAi} />
    </div>
  );
}
