import type { TransactionSql } from 'postgres';
import { sql } from '@/db/client';
import { env } from '@/lib/env';

/** Store-wide numbers staff can change without a deploy. `.env` only supplies the first-boot defaults. */
export type ShopSettings = { shippingFeeVnd: number; freeShippingFromVnd: number; maxOrdersPerHour: number };

const keys = { shippingFeeVnd: 'shipping_fee_vnd', freeShippingFromVnd: 'free_shipping_from_vnd', maxOrdersPerHour: 'max_orders_per_hour' } as const;

export const settingDefaults = (): ShopSettings => ({ shippingFeeVnd: env.SHIPPING_FEE_VND, freeShippingFromVnd: env.FREE_SHIPPING_FROM_VND, maxOrdersPerHour: 5 });

/** Reads all settings (one tiny query); pass a transaction to read inside it. */
export async function getShopSettings(tx: TransactionSql | typeof sql = sql): Promise<ShopSettings & { updatedAt: string | null }> {
  const rows = await tx<{ key: string; value: unknown; updatedAt: Date }[]>`SELECT key, value, updated_at AS "updatedAt" FROM shop_settings`;
  const settings = settingDefaults();
  let updatedAt: Date | null = null;
  for (const [name, key] of Object.entries(keys) as [keyof ShopSettings, string][]) {
    const row = rows.find((candidate) => candidate.key === key);
    if (row && typeof row.value === 'number') settings[name] = row.value;
    if (row && (!updatedAt || row.updatedAt > updatedAt)) updatedAt = row.updatedAt;
  }
  return { ...settings, updatedAt: updatedAt ? new Date(updatedAt).toISOString() : null };
}

export async function saveShopSettings(values: ShopSettings) {
  await sql.begin(async (tx) => {
    for (const [name, key] of Object.entries(keys) as [keyof ShopSettings, string][]) {
      await tx`INSERT INTO shop_settings (key, value) VALUES (${key}, ${tx.json(values[name])}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
    }
  });
}

/** Shipping is free from the threshold upward; an empty basket costs nothing. */
export function shippingFor(subtotalVnd: number, settings: Pick<ShopSettings, 'shippingFeeVnd' | 'freeShippingFromVnd'>) {
  if (subtotalVnd <= 0) return 0;
  return subtotalVnd >= settings.freeShippingFromVnd ? 0 : settings.shippingFeeVnd;
}
