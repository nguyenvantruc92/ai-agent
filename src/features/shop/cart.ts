import { randomUUID } from 'node:crypto';
import { sql } from '@/db/client';
import { imageUrl } from '@/features/catalog/images';
import { getShopSettings, shippingFor } from '@/features/shop/settings';
import { HttpError } from '@/lib/http';

export const MAX_PER_LINE = 10;

export type CartLine = {
  id: string; variantId: string; productCode: string; slug: string; name: string; size: string; color: string;
  imageUrl: string | null; quantity: number; stock: number; unitPriceVnd: number; compareAtPriceVnd: number | null; lineTotalVnd: number;
  /** Why this line cannot be ordered as it stands, if anything. */
  issue: null | { code: 'unavailable' | 'out_of_stock' | 'not_enough'; message: string };
};
export type Cart = {
  lines: CartLine[]; itemCount: number; subtotalVnd: number; shippingFeeVnd: number; totalVnd: number;
  freeShippingFromVnd: number; amountToFreeShippingVnd: number; canCheckout: boolean;
};

type Row = {
  id: string; quantity: number; variantId: string; size: string; color: string; stock: number; variantActive: boolean;
  code: string; slug: string; name: string; priceVnd: number; compareAtPriceVnd: number | null; sellable: boolean; imageKey: string | null;
};

function toLine(row: Row): CartLine {
  const available = row.sellable && row.variantActive;
  const issue: CartLine['issue'] = !available ? { code: 'unavailable', message: 'Sản phẩm này không còn được bán.' }
    : row.stock <= 0 ? { code: 'out_of_stock', message: 'Đã hết hàng.' }
    : row.quantity > row.stock ? { code: 'not_enough', message: `Chỉ còn ${row.stock} sản phẩm.` } : null;
  return {
    id: row.id, variantId: row.variantId, productCode: row.code, slug: row.slug, name: row.name, size: row.size, color: row.color,
    imageUrl: row.imageKey ? imageUrl(row.imageKey) : null, quantity: row.quantity, stock: available ? row.stock : 0,
    unitPriceVnd: row.priceVnd, compareAtPriceVnd: row.compareAtPriceVnd, lineTotalVnd: row.priceVnd * row.quantity, issue,
  };
}

/** The cart with live prices and stock; money is always recomputed here, never trusted from the browser. */
export async function getCart(visitorId: string | undefined): Promise<Cart> {
  const settings = await getShopSettings();
  const rows = visitorId ? await sql<Row[]>`
    SELECT ci.id, ci.quantity, v.id AS "variantId", v.size, v.color, v.stock, v.is_active AS "variantActive",
      p.code, p.slug, p.name, p.price_vnd AS "priceVnd", p.compare_at_price_vnd AS "compareAtPriceVnd",
      (p.status = 'active' AND p.deleted_at IS NULL AND c.is_active) AS sellable,
      (SELECT i.storage_key FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.created_at LIMIT 1) AS "imageKey"
    FROM cart_items ci
    JOIN product_variants v ON v.id = ci.variant_id
    JOIN products p ON p.id = v.product_id
    JOIN categories c ON c.id = p.category_id
    WHERE ci.visitor_id = ${visitorId}
    ORDER BY ci.created_at, ci.id
  ` : [];
  const lines = rows.map(toLine);
  const subtotalVnd = lines.reduce((sum, line) => sum + line.lineTotalVnd, 0);
  const shippingFeeVnd = shippingFor(subtotalVnd, settings);
  return {
    lines,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotalVnd, shippingFeeVnd, totalVnd: subtotalVnd + shippingFeeVnd,
    freeShippingFromVnd: settings.freeShippingFromVnd,
    amountToFreeShippingVnd: subtotalVnd > 0 ? Math.max(0, settings.freeShippingFromVnd - subtotalVnd) : settings.freeShippingFromVnd,
    canCheckout: lines.length > 0 && lines.every((line) => !line.issue),
  };
}

/** Total quantity in the cart, for the header badge. */
export async function cartCount(visitorId: string | undefined) {
  if (!visitorId) return 0;
  const [row] = await sql<{ count: number }[]>`SELECT coalesce(sum(quantity), 0)::int AS count FROM cart_items WHERE visitor_id = ${visitorId}`;
  return row.count;
}

async function sellableVariant(variantId: string) {
  const [variant] = await sql<{ stock: number }[]>`
    SELECT v.stock FROM product_variants v JOIN products p ON p.id = v.product_id JOIN categories c ON c.id = p.category_id
    WHERE v.id = ${variantId} AND v.is_active AND p.status = 'active' AND p.deleted_at IS NULL AND c.is_active
  `;
  if (!variant) throw new HttpError('Sản phẩm này không còn được bán.', 404);
  return variant;
}

/** Adds `quantity` to the line (merging with an existing one). Never lets a line exceed stock or MAX_PER_LINE. */
export async function addToCart(visitorId: string, input: { variantId: string; quantity: number }) {
  const { stock } = await sellableVariant(input.variantId);
  if (stock <= 0) throw new HttpError('Phiên bản này đã hết hàng.', 409);
  await sql.begin(async (tx) => {
    await tx`INSERT INTO carts (visitor_id) VALUES (${visitorId}) ON CONFLICT (visitor_id) DO UPDATE SET updated_at = now()`;
    const [existing] = await tx<{ quantity: number }[]>`SELECT quantity FROM cart_items WHERE visitor_id = ${visitorId} AND variant_id = ${input.variantId} FOR UPDATE`;
    const wanted = (existing?.quantity ?? 0) + input.quantity;
    if (wanted > MAX_PER_LINE) throw new HttpError(`Mỗi sản phẩm tối đa ${MAX_PER_LINE} cái trong một đơn.`, 409);
    if (wanted > stock) throw new HttpError(`Chỉ còn ${stock} sản phẩm${existing ? `, trong giỏ bạn đã có ${existing.quantity}` : ''}.`, 409);
    await tx`
      INSERT INTO cart_items (id, visitor_id, variant_id, quantity) VALUES (${randomUUID()}, ${visitorId}, ${input.variantId}, ${wanted})
      ON CONFLICT (visitor_id, variant_id) DO UPDATE SET quantity = EXCLUDED.quantity
    `;
  });
}

export async function setLineQuantity(visitorId: string, lineId: string, quantity: number) {
  const [line] = await sql<{ variantId: string }[]>`SELECT variant_id AS "variantId" FROM cart_items WHERE id = ${lineId} AND visitor_id = ${visitorId}`;
  if (!line) throw new HttpError('Không tìm thấy dòng này trong giỏ hàng.', 404);
  const { stock } = await sellableVariant(line.variantId);
  if (quantity > MAX_PER_LINE) throw new HttpError(`Mỗi sản phẩm tối đa ${MAX_PER_LINE} cái trong một đơn.`, 409);
  if (quantity > stock) throw new HttpError(`Chỉ còn ${stock} sản phẩm.`, 409);
  await sql`UPDATE cart_items SET quantity = ${quantity} WHERE id = ${lineId} AND visitor_id = ${visitorId}`;
}

export async function removeLine(visitorId: string, lineId: string) {
  const rows = await sql`DELETE FROM cart_items WHERE id = ${lineId} AND visitor_id = ${visitorId} RETURNING id`;
  if (!rows.length) throw new HttpError('Không tìm thấy dòng này trong giỏ hàng.', 404);
}
