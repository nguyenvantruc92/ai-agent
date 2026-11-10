import { randomUUID } from 'node:crypto';
import { sql } from '@/db/client';
import { syncCatalog } from '@/features/catalog/sync';
import { isOnline, type CheckoutInput } from '@/features/orders/customer-schemas';
import { recordOrderEvent } from '@/features/orders/order-ops';
import { assertPaymentMethodAvailable } from '@/features/orders/payment-availability';
import { paymentGateway } from '@/features/orders/payments';
import { audit } from '@/features/orders/repository';
import { getShopSettings, shippingFor } from '@/features/shop/settings';
import { HttpError } from '@/lib/http';

type LockedLine = {
  quantity: number; variantId: string; size: string; color: string; stock: number; variantActive: boolean;
  productId: string; code: string; name: string; priceVnd: number; compareAtPriceVnd: number | null; sellable: boolean;
};

const discountPercent = (price: number, compareAt: number | null) => (compareAt && compareAt > price ? Math.round((1 - price / compareAt) * 100) : 0);

/**
 * Turns the visitor's cart into an order in ONE transaction: lock the variants (in id order, so two
 * checkouts cannot deadlock), verify stock, price everything from the database, decrement stock, write the
 * order and clear the cart. Replaying the same idempotency key returns the original order.
 */
export async function checkout(visitorId: string, input: CheckoutInput): Promise<{ code: string; replayed: boolean }> {
  const result = await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${visitorId}))`;

    const [replay] = await tx<{ id: string }[]>`SELECT id FROM orders WHERE visitor_id = ${visitorId} AND idempotency_key = ${input.idempotencyKey}`;
    if (replay) return { code: replay.id, replayed: true };
    // After the replay check: retrying an order placed before online payment was switched off still returns it.
    assertPaymentMethodAvailable(input.paymentMethod);

    const settings = await getShopSettings(tx);
    const [{ recent }] = await tx<{ recent: number }[]>`SELECT count(*)::int AS recent FROM orders WHERE visitor_id = ${visitorId} AND ordered_at > now() - interval '1 hour'`;
    if (recent >= settings.maxOrdersPerHour) throw new HttpError('Bạn đã đặt quá nhiều đơn trong một giờ. Vui lòng thử lại sau.', 429);

    const lines = await tx<LockedLine[]>`
      SELECT ci.quantity, v.id AS "variantId", v.size, v.color, v.stock, v.is_active AS "variantActive",
        p.id AS "productId", p.code, p.name, p.price_vnd AS "priceVnd", p.compare_at_price_vnd AS "compareAtPriceVnd",
        (p.status = 'active' AND p.deleted_at IS NULL AND c.is_active) AS sellable
      FROM cart_items ci
      JOIN product_variants v ON v.id = ci.variant_id
      JOIN products p ON p.id = v.product_id
      JOIN categories c ON c.id = p.category_id
      WHERE ci.visitor_id = ${visitorId}
      ORDER BY v.id
      FOR UPDATE OF v
    `;
    if (!lines.length) throw new HttpError('Giỏ hàng đang trống.', 400);
    for (const line of lines) {
      const label = `${line.name} (${line.size} / ${line.color})`;
      if (!line.sellable || !line.variantActive) throw new HttpError(`${label} không còn được bán. Hãy xóa khỏi giỏ hàng rồi đặt lại.`, 409);
      if (line.stock < line.quantity) throw new HttpError(line.stock <= 0 ? `${label} đã hết hàng.` : `${label} chỉ còn ${line.stock} sản phẩm.`, 409);
    }

    const subtotalVnd = lines.reduce((sum, line) => sum + line.priceVnd * line.quantity, 0);
    const shippingFeeVnd = shippingFor(subtotalVnd, settings);
    const totalVnd = subtotalVnd + shippingFeeVnd;
    const [{ n }] = await tx<{ n: string }[]>`SELECT nextval('order_number_seq')::text AS n`;
    const code = `FT-${new Date().getFullYear()}-${n}`;

    await tx`
      INSERT INTO orders (id, customer_ref, status, ordered_at, payment_method, shipping_fee_vnd, customer_name, phone, address, note,
        visitor_id, payment_status, subtotal_vnd, total_vnd, idempotency_key)
      VALUES (${code}, ${visitorId}, 'processing', now(), ${input.paymentMethod}, ${shippingFeeVnd}, ${input.name}, ${input.phone}, ${input.address}, ${input.note},
        ${visitorId}, 'unpaid', ${subtotalVnd}, ${totalVnd}, ${input.idempotencyKey})
    `;
    await recordOrderEvent(tx, code, { type: 'placed', actor: 'customer', to: 'processing', note: input.paymentMethod });
    for (const line of lines) {
      await tx`
        INSERT INTO order_items (id, order_id, product_id, product_name, size, color, quantity, unit_price_vnd, discount_percent, variant_id)
        VALUES (${randomUUID()}, ${code}, ${line.code}, ${line.name}, ${line.size}, ${line.color}, ${line.quantity}, ${line.priceVnd}, ${discountPercent(line.priceVnd, line.compareAtPriceVnd)}, ${line.variantId})
      `;
      const updated = await tx`UPDATE product_variants SET stock = stock - ${line.quantity}, updated_at = now() WHERE id = ${line.variantId} AND stock >= ${line.quantity} RETURNING id`;
      if (!updated.length) throw new HttpError(`${line.name} (${line.size} / ${line.color}) vừa hết hàng.`, 409);
    }
    if (isOnline(input.paymentMethod)) {
      const { providerRef } = await paymentGateway.initiate({ code, amountVnd: totalVnd, method: input.paymentMethod });
      await tx`INSERT INTO payments (id, order_id, method, status, amount_vnd, provider_ref) VALUES (${randomUUID()}, ${code}, ${input.paymentMethod}, 'pending', ${totalVnd}, ${providerRef})`;
    }
    await tx`DELETE FROM cart_items WHERE visitor_id = ${visitorId}`;
    return { code, replayed: false, totalVnd };
  });

  if (!result.replayed) {
    await audit('customer', 'order.create', 'order', result.code, { totalVnd: 'totalVnd' in result ? result.totalVnd : undefined, paymentMethod: input.paymentMethod });
    await syncCatalog();
  }
  return { code: result.code, replayed: result.replayed };
}
