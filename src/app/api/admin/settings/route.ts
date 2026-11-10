import { NextResponse } from 'next/server';
import { syncCatalog } from '@/features/catalog/sync';
import { audit } from '@/features/orders/repository';
import { getShopSettings, saveShopSettings } from '@/features/shop/settings';
import { settingsInput } from '@/features/shop/settings-schema';
import { apiError, requireAdmin } from '@/lib/http';

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  try { return NextResponse.json(await getShopSettings()); } catch (error) { return apiError(error); }
}

export async function PUT(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const values = settingsInput.parse(await request.json());
    await saveShopSettings(values);
    await audit('admin', 'settings.update', 'settings', 'shop', values);
    await syncCatalog(); // the shipping-policy chunk the chatbot reads is generated from these numbers
    return NextResponse.json(await getShopSettings());
  } catch (error) { return apiError(error); }
}
