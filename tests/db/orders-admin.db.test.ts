import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** Needs TEST_DATABASE_URL (see catalog-admin.db.test.ts); skipped otherwise. */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('admin order management (Postgres)', () => {
  let sql: typeof import('@/db/client').sql;
  let admin: typeof import('@/features/catalog/admin-repository');
  let cart: typeof import('@/features/shop/cart');
  let checkoutMod: typeof import('@/features/orders/checkout');
  let customer: typeof import('@/features/orders/customer-orders');
  let manage: typeof import('@/features/orders/admin-orders');
  let schemas: typeof import('@/features/orders/admin-schemas');
  let categoryId: string;
  let counter = 0;

  const stockOf = async (id: string) => (await sql<{ stock: number }[]>`SELECT stock FROM product_variants WHERE id = ${id}`)[0].stock;
  const info = (paymentMethod: 'COD' | 'card' | 'bank_transfer', overrides: Record<string, unknown> = {}) => ({ name: 'Nguyễn Văn A', phone: '0901234567', address: '12 Lê Lợi, Quận 1, TP. Hồ Chí Minh', note: '', paymentMethod, idempotencyKey: randomUUID(), ...overrides });
  const list = (query: Record<string, unknown> = {}) => manage.listAdminOrders(schemas.orderListQuery.parse(query));

  /** A fresh product with 10 units, bought by a new visitor. */
  async function place(paymentMethod: 'COD' | 'card' | 'bank_transfer' = 'COD', quantity = 2, overrides: Record<string, unknown> = {}) {
    counter += 1;
    const product = await admin.createProduct({ code: `AO-${counter}`, name: `Áo ${counter}`, categoryId, description: '', material: '', priceVnd: 400000, compareAtPriceVnd: null, status: 'active', variants: [{ size: 'M', color: 'Trắng', stock: 10, isActive: true }] });
    const [variant] = await sql<{ id: string }[]>`SELECT id FROM product_variants WHERE product_id = ${product.id}`;
    const visitor = randomUUID();
    await cart.addToCart(visitor, { variantId: variant.id, quantity });
    const { code } = await checkoutMod.checkout(visitor, info(paymentMethod, overrides));
    return { code, visitor, variantId: variant.id };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ sql } = await import('@/db/client'));
    await (await import('@/db/apply-migrations')).applyMigrations();
    admin = await import('@/features/catalog/admin-repository');
    cart = await import('@/features/shop/cart');
    checkoutMod = await import('@/features/orders/checkout');
    customer = await import('@/features/orders/customer-orders');
    manage = await import('@/features/orders/admin-orders');
    schemas = await import('@/features/orders/admin-schemas');
  });
  afterAll(async () => { await sql?.end(); });
  beforeEach(async () => {
    await sql`TRUNCATE categories, products, orders, carts, shop_settings, knowledge_documents, audit_logs, approval_requests, chat_threads CASCADE`;
    categoryId = (await admin.createCategory({ name: 'Áo', description: '', sortOrder: 0, isActive: true })).id;
  });

  describe('transitions', () => {
    it('ships and delivers a COD order, collecting the money on delivery and writing the timeline', async () => {
      const { code } = await place('COD');
      expect((await manage.transitionOrder(code, 'ship')).status).toBe('shipping');
      const delivered = await manage.transitionOrder(code, 'deliver', 'Giao thành công');
      expect(delivered).toMatchObject({ status: 'delivered', paymentStatus: 'paid' });
      expect(delivered.deliveredAt).not.toBeNull();
      expect(delivered.payments).toEqual([expect.objectContaining({ status: 'succeeded', providerRef: 'COD-COLLECTED', amountVnd: delivered.totalVnd })]);
      expect(delivered.events.map((event) => event.type)).toEqual(['placed', 'shipped', 'delivered', 'cod_collected']);
      expect(delivered.events.find((event) => event.type === 'delivered')).toMatchObject({ from: 'shipping', to: 'delivered', note: 'Giao thành công', actor: 'admin' });
    });

    it('does not let an unpaid online order ship until the customer has paid', async () => {
      const { code, visitor } = await place('card');
      await expect(manage.transitionOrder(code, 'ship')).rejects.toMatchObject({ status: 409 });
      await customer.payCustomerOrder(code, { visitorId: visitor }, 'failure');
      await expect(manage.transitionOrder(code, 'ship')).rejects.toMatchObject({ status: 409 });
      await customer.payCustomerOrder(code, { visitorId: visitor }, 'success');
      await manage.transitionOrder(code, 'ship');
      const delivered = await manage.transitionOrder(code, 'deliver');
      expect(delivered.payments.filter((payment) => payment.providerRef === 'COD-COLLECTED')).toHaveLength(0);
      expect(delivered.paymentStatus).toBe('paid');
    });

    it('rejects out-of-order, repeated and post-final transitions, and unknown orders', async () => {
      const { code } = await place('COD');
      await expect(manage.transitionOrder(code, 'deliver')).rejects.toMatchObject({ status: 409 });
      await manage.transitionOrder(code, 'ship');
      await expect(manage.transitionOrder(code, 'ship')).rejects.toMatchObject({ status: 409 });
      await manage.transitionOrder(code, 'deliver');
      await expect(manage.transitionOrder(code, 'cancel')).rejects.toMatchObject({ status: 409 });
      await expect(manage.transitionOrder('FT-0000-0', 'ship')).rejects.toMatchObject({ status: 404 });
    });

    it('cancels an unpaid order and puts the stock back', async () => {
      const { code, variantId } = await place('COD', 3);
      expect(await stockOf(variantId)).toBe(7);
      const cancelled = await manage.transitionOrder(code, 'cancel', 'Khách đổi ý');
      expect(cancelled).toMatchObject({ status: 'cancelled', paymentStatus: 'unpaid' });
      expect(await stockOf(variantId)).toBe(10);
      await expect(manage.transitionOrder(code, 'cancel')).rejects.toMatchObject({ status: 409 });
      expect(await stockOf(variantId)).toBe(10);
    });

    it('refunds (simulated) when a paid order is cancelled, even while shipping, and restocks', async () => {
      const { code, visitor, variantId } = await place('bank_transfer', 2);
      await customer.payCustomerOrder(code, { visitorId: visitor }, 'success');
      await manage.transitionOrder(code, 'ship');
      const cancelled = await manage.transitionOrder(code, 'cancel', 'Hết hàng thực tế');
      expect(cancelled).toMatchObject({ status: 'cancelled', paymentStatus: 'refunded' });
      expect(cancelled.payments.map((payment) => payment.status)).toEqual(['refunded']);
      expect(cancelled.events.map((event) => event.type)).toEqual(['placed', 'payment_succeeded', 'shipped', 'cancelled', 'refunded']);
      expect(await stockOf(variantId)).toBe(10);
      expect(await customer.getCustomerOrder(code, { visitorId: visitor })).toMatchObject({ status: 'cancelled', paymentStatus: 'refunded', canCancel: false, canPay: false });
    });

    it('serialises concurrent staff actions on the same order', async () => {
      const { code } = await place('COD');
      const results = await Promise.allSettled([manage.transitionOrder(code, 'ship'), manage.transitionOrder(code, 'ship')]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
      expect((await manage.getAdminOrder(code)).events.filter((event) => event.type === 'shipped')).toHaveLength(1);
    });
  });

  describe('listing and detail', () => {
    it('filters by status, payment, search text (name without accents, phone, code) and counts per status', async () => {
      const a = await place('COD', 1, { name: 'Lê Văn Đức', phone: '0911111111' });
      const b = await place('card', 1, { name: 'Trần Thị Mai', phone: '0922222222' });
      await place('COD', 1, { name: 'Phạm Quốc Bảo', phone: '0933333333' });
      await manage.transitionOrder(a.code, 'ship');
      const codes = async (query: Record<string, unknown>) => (await list(query)).items.map((item) => item.code);

      expect((await list()).total).toBe(3);
      expect(await codes({ status: 'shipping' })).toEqual([a.code]);
      expect(await codes({ payment: 'unpaid', q: 'tran thi' })).toEqual([b.code]);
      expect(await codes({ q: 'duc' })).toEqual([a.code]);
      expect(await codes({ q: '0922' })).toEqual([b.code]);
      expect(await codes({ q: a.code.toLowerCase() })).toEqual([a.code]);
      expect(await codes({ q: '%' })).toEqual([]);
      expect(await manage.adminOrderCounts()).toEqual({ all: 3, processing: 2, shipping: 1, delivered: 0, cancelled: 0 });
    });

    it('filters by order date in Vietnam time, paginates and lists newest first', async () => {
      const first = await place(); const second = await place(); const third = await place();
      await sql`UPDATE orders SET ordered_at = now() - interval '10 days' WHERE id = ${first.code}`;
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
      expect((await list({ from: today })).items.map((item) => item.code).sort()).toEqual([second.code, third.code].sort());
      expect((await list({ to: today })).total).toBe(3);
      const page = await list({ pageSize: 2, page: 2 });
      expect(page).toMatchObject({ total: 3, pageCount: 2 });
      expect(page.items.map((item) => item.code)).toEqual([first.code]);
    });

    it('returns the full order for staff: contact data, lines, payments, requests and pending approvals', async () => {
      const { code } = await place('card', 2);
      const [thread] = await sql<{ id: string }[]>`INSERT INTO chat_threads (id, visitor_id) VALUES (${randomUUID()}, 'v') RETURNING id`;
      await sql`INSERT INTO approval_requests (id, thread_id, action, payload, summary, idempotency_key, expires_at) VALUES (${randomUUID()}, ${thread.id}, 'return', ${sql.json({ orderId: code })}, 'Trả hàng', ${`${code}:x`}, now() + interval '1 day')`;
      await sql`INSERT INTO exchange_return_requests (id, idempotency_key, type, order_id, product_id, reason) VALUES (${randomUUID()}, ${`${code}:return`}, 'return', ${code}, 'AO-1', 'wrong_item')`;
      const detail = await manage.getAdminOrder(code.toLowerCase());
      expect(detail).toMatchObject({ code, phone: '0901234567', address: '12 Lê Lợi, Quận 1, TP. Hồ Chí Minh', customerName: 'Nguyễn Văn A', subtotalVnd: 800000, pendingApprovals: 1 });
      expect(detail.items).toHaveLength(1);
      expect(detail.payments).toEqual([expect.objectContaining({ status: 'pending', method: 'card' })]);
      expect(detail.requests).toEqual([expect.objectContaining({ type: 'return', productCode: 'AO-1' })]);
      await expect(manage.getAdminOrder('nope')).rejects.toMatchObject({ status: 404 });
    });
  });

  it('computes dashboard stats from paid, non-cancelled orders only', async () => {
    const paid = await place('card', 1);
    await customer.payCustomerOrder(paid.code, { visitorId: paid.visitor }, 'success');
    await place('card', 1);
    const cancelled = await place('card', 1);
    await customer.payCustomerOrder(cancelled.code, { visitorId: cancelled.visitor }, 'success');
    await manage.transitionOrder(cancelled.code, 'cancel');
    const cod = await place('COD', 1);
    await manage.transitionOrder(cod.code, 'ship');
    await manage.transitionOrder(cod.code, 'deliver');

    const stats = await manage.getOrderStats();
    expect(stats.revenue30).toBe(430000 + 430000); // two paid orders: 400.000 + 30.000 shipping each
    expect(stats.processing).toBe(2); // the paid card order has not shipped yet, plus the unpaid one
    expect(stats.today).toBe(4);
    expect(stats.byDay).toHaveLength(14);
    expect(stats.byDay.at(-1)).toMatchObject({ revenueVnd: 860000, orders: 3 });
    expect(stats.recent).toHaveLength(4);
  });
});
