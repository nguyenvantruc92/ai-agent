import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** Needs TEST_DATABASE_URL (see catalog-admin.db.test.ts); skipped otherwise. */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('agent shopping tools (Postgres)', () => {
  let sql: typeof import('@/db/client').sql;
  let admin: typeof import('@/features/catalog/admin-repository');
  let tools: typeof import('@/features/agent/shop-tools');
  let confirmations: typeof import('@/features/agent/confirmations');
  let repository: typeof import('@/features/orders/repository');
  let policy: typeof import('@/features/orders/policy');
  let categoryId: string;

  const v = (size: string, color: string, stock: number) => ({ size, color, stock, isActive: true });
  const product = (code: string, overrides: Record<string, unknown> = {}) => admin.createProduct({
    code, name: `Áo polo ${code}`, categoryId, description: '', material: '', priceVnd: 300000, compareAtPriceVnd: null, status: 'active' as const, variants: [v('M', 'Trắng', 10), v('L', 'Trắng', 10), v('M', 'Đen', 5)], ...overrides,
  } as never);
  const thread = async (visitorId = randomUUID()) => {
    const id = randomUUID();
    await sql`INSERT INTO chat_threads (id, visitor_id) VALUES (${id}, ${visitorId})`;
    return { id, visitorId };
  };
  const stockOf = async (code: string, size: string, color: string) => (await sql<{ stock: number }[]>`
    SELECT v.stock FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.code = ${code} AND v.size = ${size} AND v.color = ${color}`)[0].stock;
  const checkoutPayload = { name: 'Nguyễn Văn An', phone: '0912345678', address: '12 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh', note: '', paymentMethod: 'COD' };
  /** What the graph does: price the cart, store the confirmation the customer is shown, then the customer presses a button. */
  const askToCheckout = async (threadId: string, decide: 'confirmed' | 'cancelled' | null = 'confirmed') => {
    const { cartFingerprint } = await import('@/features/agent/shop-types');
    const cart = await tools.viewCartForThread(threadId);
    const { id } = await confirmations.postgresConfirmations.create({ threadId, action: 'checkout', payload: checkoutPayload, summary: 'Đặt hàng', details: ['x'], fingerprint: cartFingerprint(cart) });
    if (decide) await confirmations.decideConfirmation(id, decide);
    return id;
  };
  const orderCount = async () => (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM orders`)[0].n;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ sql } = await import('@/db/client'));
    await (await import('@/db/apply-migrations')).applyMigrations();
    admin = await import('@/features/catalog/admin-repository');
    tools = await import('@/features/agent/shop-tools');
    confirmations = await import('@/features/agent/confirmations');
    repository = await import('@/features/orders/repository');
    policy = await import('@/features/orders/policy');
  });
  afterAll(async () => { await sql?.end(); });
  beforeEach(async () => {
    await sql`TRUNCATE categories, products, orders, carts, shop_settings, knowledge_documents, audit_logs, chat_threads, approval_requests CASCADE`;
    categoryId = (await admin.createCategory({ name: 'Áo polo', description: '', sortOrder: 0, isActive: true })).id;
  });

  describe('search and cart', () => {
    it('finds products and drops trailing words until something matches', async () => {
      await product('PL-9');
      expect((await tools.searchProductsForAgent('áo polo trắng size M', null)).map((hit) => hit.product_id)).toEqual(['PL-9']);
      expect(await tools.searchProductsForAgent('quần tây', null)).toEqual([]);
      expect(await tools.searchProductsForAgent('polo', 100000)).toEqual([]);
    });

    it('resolves variants by code, size and colour (any case) and keeps each thread\'s cart separate', async () => {
      await product('PL-9');
      const a = await thread();
      const b = await thread();
      const cart = await tools.addToCartForThread(a.id, { productCode: 'pl-9', size: 'm', color: 'đen', quantity: 2 });
      expect(cart.lines).toMatchObject([{ product_code: 'PL-9', size: 'M', color: 'Đen', quantity: 2, line_total_vnd: 600000 }]);
      expect(cart.total_vnd).toBe(cart.subtotal_vnd + cart.shipping_fee_vnd);
      expect((await tools.viewCartForThread(b.id)).lines).toEqual([]);
      await tools.addToCartForThread(a.id, { productCode: 'PL-9', size: 'M', color: 'Đen', quantity: 1 });
      expect((await tools.viewCartForThread(a.id)).lines[0].quantity).toBe(3);
    });

    it('explains the options when the size or colour does not exist, and when the colour is ambiguous', async () => {
      await product('PL-9');
      const t = await thread();
      await expect(tools.addToCartForThread(t.id, { productCode: 'PL-9', size: 'XXL', color: null, quantity: 1 })).rejects.toThrow(/Các phiên bản đang bán: .*M \/ Trắng/);
      await expect(tools.addToCartForThread(t.id, { productCode: 'PL-9', size: 'M', color: null, quantity: 1 })).rejects.toThrow(/nhiều màu/);
      await expect(tools.addToCartForThread(t.id, { productCode: 'NOPE-1', size: 'M', color: null, quantity: 1 })).rejects.toMatchObject({ status: 404 });
      await product('PL-8', { variants: [v('M', 'Xanh', 3)] });
      expect((await tools.addToCartForThread(t.id, { productCode: 'PL-8', size: 'M', color: null, quantity: 1 })).lines[0].color).toBe('Xanh');
    });

    it('never goes over stock, and set_cart_quantity changes or removes a line', async () => {
      await product('PL-9');
      const t = await thread();
      await expect(tools.addToCartForThread(t.id, { productCode: 'PL-9', size: 'M', color: 'Đen', quantity: 6 })).rejects.toMatchObject({ status: 409 });
      await tools.addToCartForThread(t.id, { productCode: 'PL-9', size: 'M', color: 'Đen', quantity: 2 });
      expect((await tools.setCartQuantityForThread(t.id, { productCode: 'PL-9', size: 'M', color: 'Đen', quantity: 4 })).lines[0].quantity).toBe(4);
      expect((await tools.setCartQuantityForThread(t.id, { productCode: 'PL-9', size: 'M', color: 'Đen', quantity: 0 })).lines).toEqual([]);
      await expect(tools.setCartQuantityForThread(t.id, { productCode: 'PL-9', size: 'L', color: 'Trắng', quantity: 1 })).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('customer-confirmed checkout', () => {
    it('refuses to order until the customer confirms, then places exactly what was shown', async () => {
      await product('PL-9');
      const t = await thread();
      await tools.addToCartForThread(t.id, { productCode: 'PL-9', size: 'M', color: 'Trắng', quantity: 2 });
      const id = await askToCheckout(t.id, null);
      await expect(tools.checkoutConfirmed(t.id, id)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('chưa xác nhận') });
      expect(await orderCount()).toBe(0);

      await confirmations.decideConfirmation(id, 'confirmed');
      const result = await tools.checkoutConfirmed(t.id, id) as { order_code: string; total_vnd: number; payment_status: string };
      expect(result).toMatchObject({ status: 'created', total_vnd: 630000, payment_status: 'unpaid' });
      const [order] = await sql<{ customer_name: string; phone: string; visitor_id: string; total_vnd: number }[]>`SELECT customer_name, phone, visitor_id, total_vnd FROM orders WHERE id = ${result.order_code}`;
      expect(order).toMatchObject({ customer_name: 'Nguyễn Văn An', phone: '0912345678', visitor_id: t.visitorId, total_vnd: 630000 });
      expect(await stockOf('PL-9', 'M', 'Trắng')).toBe(8);
      expect((await tools.viewCartForThread(t.id)).lines).toEqual([]);
    });

    it('is single-use: asking again returns the same order and never places a second one', async () => {
      await product('PL-9');
      const t = await thread();
      await tools.addToCartForThread(t.id, { productCode: 'PL-9', size: 'M', color: 'Trắng', quantity: 1 });
      const id = await askToCheckout(t.id);
      const first = await tools.checkoutConfirmed(t.id, id);
      const second = await tools.checkoutConfirmed(t.id, id);
      expect(second).toEqual(first);
      expect(await orderCount()).toBe(1);
      expect(await stockOf('PL-9', 'M', 'Trắng')).toBe(9);
    });

    it('does not accept a confirmation from another thread, for another action, or after the customer pressed Huỷ', async () => {
      await product('PL-9');
      const mine = await thread();
      const other = await thread();
      await tools.addToCartForThread(mine.id, { productCode: 'PL-9', size: 'M', color: 'Trắng', quantity: 1 });
      await tools.addToCartForThread(other.id, { productCode: 'PL-9', size: 'M', color: 'Trắng', quantity: 1 });
      const id = await askToCheckout(mine.id);
      await expect(tools.checkoutConfirmed(other.id, id)).rejects.toMatchObject({ status: 404 });
      await expect(tools.cancelOrderConfirmed(mine.id, id)).rejects.toMatchObject({ status: 404 });
      const declined = await askToCheckout(other.id, 'cancelled');
      await expect(tools.checkoutConfirmed(other.id, declined)).rejects.toMatchObject({ status: 409 });
      expect(await orderCount()).toBe(0);
    });

    it('refuses when the cart changed after the customer confirmed', async () => {
      await product('PL-9');
      const t = await thread();
      await tools.addToCartForThread(t.id, { productCode: 'PL-9', size: 'M', color: 'Trắng', quantity: 1 });
      const id = await askToCheckout(t.id);
      await tools.addToCartForThread(t.id, { productCode: 'PL-9', size: 'L', color: 'Trắng', quantity: 1 });
      await expect(tools.checkoutConfirmed(t.id, id)).rejects.toThrow(/đã thay đổi/);
      expect(await orderCount()).toBe(0);
      expect((await confirmations.getConfirmation(id))?.status).toBe('failed');
    });

    it('cannot be confirmed after it expired, and a new question replaces the pending one', async () => {
      await product('PL-9');
      const t = await thread();
      await tools.addToCartForThread(t.id, { productCode: 'PL-9', size: 'M', color: 'Trắng', quantity: 1 });
      const old = await askToCheckout(t.id, null);
      await sql`UPDATE customer_confirmations SET expires_at = now() - interval '1 minute' WHERE id = ${old}`;
      expect(await confirmations.decideConfirmation(old, 'confirmed')).toBeUndefined();
      expect((await confirmations.pendingConfirmationForThread(t.id))?.id).toBe(old);
      expect(confirmations.isExpired((await confirmations.getConfirmation(old))!)).toBe(true);

      const fresh = await askToCheckout(t.id, null);
      expect((await confirmations.getConfirmation(old))?.status).toBe('cancelled');
      expect((await confirmations.pendingConfirmationForThread(t.id))?.id).toBe(fresh);
    });
  });

  describe('order verification and cancelling', () => {
    const placeOrder = async (t: { id: string; visitorId: string }) => {
      await tools.addToCartForThread(t.id, { productCode: 'PL-9', size: 'M', color: 'Trắng', quantity: 2 });
      return (await tools.checkoutConfirmed(t.id, await askToCheckout(t.id)) as { order_code: string }).order_code;
    };

    it('lets the browser that placed the order see it without a phone, and anyone else only with the right phone', async () => {
      await product('PL-9');
      const owner = await thread();
      const code = await placeOrder(owner);
      expect(await tools.verifyOrderForThread(owner.id, code, null)).toMatchObject({ verified: true, order: { id: code, canCancel: true, paymentStatus: 'unpaid' } });

      const stranger = await thread();
      expect(await tools.verifyOrderForThread(stranger.id, code, null)).toMatchObject({ verified: false, message: expect.stringContaining('số điện thoại') });
      expect(await tools.verifyOrderForThread(stranger.id, code, '0911111111')).toMatchObject({ verified: false });
      expect(await tools.verifyOrderForThread(stranger.id, code, '+84 912.345.678')).toMatchObject({ verified: true });
      expect(await tools.verifyOrderForThread(stranger.id, 'FT-2026-9999', '0912345678')).toMatchObject({ verified: false, message: expect.stringContaining('Không tìm thấy') });
    });

    it('throttles phone guessing per thread', async () => {
      await product('PL-9');
      const code = await placeOrder(await thread());
      const guesser = await thread();
      for (let attempt = 0; attempt < 5; attempt += 1) await tools.verifyOrderForThread(guesser.id, code, `09000000${attempt}0`);
      expect(await tools.verifyOrderForThread(guesser.id, code, '0912345678')).toMatchObject({ verified: false, message: expect.stringContaining('quá nhiều') });
    });

    it('cancels only what the customer confirmed, puts the stock back, and works with the phone for another browser', async () => {
      await product('PL-9');
      const code = await placeOrder(await thread());
      expect(await stockOf('PL-9', 'M', 'Trắng')).toBe(8);
      const asker = await thread();
      const order = (await repository.findOrder(code))!;
      const { orderFingerprint } = await import('@/features/agent/shop-types');
      const { id } = await confirmations.postgresConfirmations.create({ threadId: asker.id, action: 'cancel_order', payload: { orderCode: code, phone: '0912345678' }, summary: 'Hủy', details: ['x'], fingerprint: orderFingerprint({ id: order.id, status: order.status, paymentStatus: order.paymentStatus }) });
      await expect(tools.cancelOrderConfirmed(asker.id, id)).rejects.toMatchObject({ status: 409 });
      await confirmations.decideConfirmation(id, 'confirmed');
      expect(await tools.cancelOrderConfirmed(asker.id, id)).toMatchObject({ status: 'cancelled', order_code: code, order_status: 'cancelled' });
      expect(await stockOf('PL-9', 'M', 'Trắng')).toBe(10);
    });

    it('refuses to cancel when the order changed (paid) after the customer was asked', async () => {
      await product('PL-9');
      const code = await placeOrder(await thread());
      const asker = await thread();
      const order = (await repository.findOrder(code))!;
      const { orderFingerprint } = await import('@/features/agent/shop-types');
      const { id } = await confirmations.postgresConfirmations.create({ threadId: asker.id, action: 'cancel_order', payload: { orderCode: code, phone: '0912345678' }, summary: 'Hủy', details: ['x'], fingerprint: orderFingerprint({ id: order.id, status: order.status, paymentStatus: order.paymentStatus }) });
      await confirmations.decideConfirmation(id, 'confirmed');
      await sql`UPDATE orders SET payment_status = 'paid' WHERE id = ${code}`;
      await expect(tools.cancelOrderConfirmed(asker.id, id)).rejects.toThrow(/đã thay đổi/);
      expect((await repository.findOrder(code))?.status).toBe('processing');
    });
  });

  describe('exchange/return on an order with the same product on two lines', () => {
    it('stores the chosen line, and the next request on the other line is still allowed', async () => {
      await product('PL-9');
      const t = await thread();
      await tools.addToCartForThread(t.id, { productCode: 'PL-9', size: 'M', color: 'Trắng', quantity: 1 });
      await tools.addToCartForThread(t.id, { productCode: 'PL-9', size: 'L', color: 'Trắng', quantity: 1 });
      const code = (await tools.checkoutConfirmed(t.id, await askToCheckout(t.id)) as { order_code: string }).order_code;
      await sql`UPDATE orders SET status = 'delivered', delivered_at = now() WHERE id = ${code}`;
      const catalogProduct = { productId: 'PL-9', name: 'Áo polo PL-9', category: 'Áo polo', priceVnd: 300000, sizes: ['M', 'L', 'XL'], colors: ['Trắng'], stockStatus: 'Còn hàng', updatedAt: '' };
      const exchange = (requestedSize: string, itemSize?: string) => ({ action: 'exchange_size' as const, orderId: code, productId: 'PL-9', requestedSize, itemSize });

      expect(policy.checkRequest(exchange('XL'), (await repository.findOrder(code)), catalogProduct, new Date())).toMatchObject({ ok: false, code: 'ambiguous_item' });
      const checked = policy.checkRequest(exchange('XL', 'M'), (await repository.findOrder(code)), catalogProduct, new Date());
      if (!checked.ok) throw new Error(checked.message);
      expect(checked.proposal).toMatchObject({ itemSize: 'M', itemColor: 'Trắng' });

      const threadForApproval = await thread();
      const approvalId = randomUUID();
      await sql`INSERT INTO approval_requests (id, thread_id, action, payload, summary, idempotency_key, status, expires_at)
        VALUES (${approvalId}, ${threadForApproval.id}, 'exchange_size', ${sql.json({})}, 'x', ${checked.idempotencyKey}, 'approved', now() + interval '7 days')`;
      const created = await repository.createApprovedRequest(checked.proposal, approvalId);
      expect(created.created).toBe(true);
      const [row] = await sql<{ item_size: string; item_color: string }[]>`SELECT item_size, item_color FROM exchange_return_requests WHERE id = ${created.requestId}`;
      expect(row).toEqual({ item_size: 'M', item_color: 'Trắng' });

      const after = await repository.findOrder(code);
      expect(after?.requests[0]).toMatchObject({ itemSize: 'M', itemColor: 'Trắng' });
      expect(policy.checkRequest(exchange('L', 'M'), after, catalogProduct, new Date())).toMatchObject({ ok: false, code: 'already_requested' });
      expect(policy.checkRequest(exchange('XL', 'L'), after, catalogProduct, new Date())).toMatchObject({ ok: true });
    });
  });
});
