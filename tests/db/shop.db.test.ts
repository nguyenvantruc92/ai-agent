import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** Needs TEST_DATABASE_URL (see catalog-admin.db.test.ts); skipped otherwise. */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('cart, checkout and customer orders (Postgres)', () => {
  let sql: typeof import('@/db/client').sql;
  let admin: typeof import('@/features/catalog/admin-repository');
  let cart: typeof import('@/features/shop/cart');
  let settings: typeof import('@/features/shop/settings');
  let checkoutMod: typeof import('@/features/orders/checkout');
  let orders: typeof import('@/features/orders/customer-orders');
  let chunks: typeof import('@/features/catalog/chunks');
  let categoryId: string;

  const v = (size: string, color: string, stock: number) => ({ size, color, stock, isActive: true });
  const product = (code: string, overrides: Record<string, unknown> = {}) => admin.createProduct({
    code, name: `Áo ${code}`, categoryId, description: '', material: '', priceVnd: 300000, compareAtPriceVnd: null, status: 'active' as const, variants: [v('M', 'Trắng', 10), v('L', 'Trắng', 10)], ...overrides,
  } as never);
  const stockOf = async (id: string) => (await sql<{ stock: number }[]>`SELECT stock FROM product_variants WHERE id = ${id}`)[0].stock;
  const variantsOf = async (productId: string) => sql<{ id: string; size: string; stock: number }[]>`SELECT id, size, stock FROM product_variants WHERE product_id = ${productId} ORDER BY position`;
  const info = (overrides: Record<string, unknown> = {}) => ({ name: 'Nguyễn Văn A', phone: '0901234567', address: '12 Lê Lợi, Quận 1, TP. Hồ Chí Minh', note: '', paymentMethod: 'COD' as const, idempotencyKey: randomUUID(), ...overrides });
  const buy = (visitor: string, ...lines: [string, number][]) => Promise.all(lines.map(([variantId, quantity]) => cart.addToCart(visitor, { variantId, quantity })));

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ sql } = await import('@/db/client'));
    await (await import('@/db/apply-migrations')).applyMigrations();
    admin = await import('@/features/catalog/admin-repository');
    cart = await import('@/features/shop/cart');
    settings = await import('@/features/shop/settings');
    checkoutMod = await import('@/features/orders/checkout');
    orders = await import('@/features/orders/customer-orders');
    chunks = await import('@/features/catalog/chunks');
  });
  afterAll(async () => { await sql?.end(); });
  beforeEach(async () => {
    await sql`TRUNCATE categories, products, orders, carts, shop_settings, knowledge_documents, audit_logs CASCADE`;
    categoryId = (await admin.createCategory({ name: 'Áo', description: '', sortOrder: 0, isActive: true })).id;
  });

  describe('cart', () => {
    it('merges lines and never lets a line exceed stock or ten units', async () => {
      const p = await product('C-1', { variants: [v('M', 'Trắng', 4), v('L', 'Trắng', 30), v('S', 'Trắng', 0)] });
      const [m, l, s] = await variantsOf(p.id);
      const visitor = randomUUID();
      await cart.addToCart(visitor, { variantId: m.id, quantity: 2 });
      await cart.addToCart(visitor, { variantId: m.id, quantity: 2 });
      expect((await cart.getCart(visitor)).lines[0].quantity).toBe(4);
      await expect(cart.addToCart(visitor, { variantId: m.id, quantity: 1 })).rejects.toMatchObject({ status: 409 });
      await cart.addToCart(visitor, { variantId: l.id, quantity: 10 });
      await expect(cart.addToCart(visitor, { variantId: l.id, quantity: 1 })).rejects.toMatchObject({ status: 409 });
      await expect(cart.addToCart(visitor, { variantId: s.id, quantity: 1 })).rejects.toMatchObject({ status: 409 });
    });

    it('refuses variants of hidden products and keeps carts private per visitor', async () => {
      const p = await product('C-2', { status: 'draft' });
      const [m] = await variantsOf(p.id);
      await expect(cart.addToCart(randomUUID(), { variantId: m.id, quantity: 1 })).rejects.toMatchObject({ status: 404 });
      const open = await product('C-3');
      const [o] = await variantsOf(open.id);
      const a = randomUUID(); const b = randomUUID();
      await cart.addToCart(a, { variantId: o.id, quantity: 1 });
      expect((await cart.getCart(b)).lines).toEqual([]);
      expect((await cart.getCart(undefined)).itemCount).toBe(0);
    });

    it('prices from the database, applies the shipping threshold and flags lines that stopped being orderable', async () => {
      const p = await product('C-4', { priceVnd: 500000 });
      const [m, l] = await variantsOf(p.id);
      const visitor = randomUUID();
      await buy(visitor, [m.id, 1]);
      let current = await cart.getCart(visitor);
      expect(current).toMatchObject({ subtotalVnd: 500000, shippingFeeVnd: 30000, totalVnd: 530000, amountToFreeShippingVnd: 299000, canCheckout: true });
      await buy(visitor, [l.id, 1]);
      current = await cart.getCart(visitor);
      expect(current).toMatchObject({ subtotalVnd: 1000000, shippingFeeVnd: 0, totalVnd: 1000000, amountToFreeShippingVnd: 0 });
      await sql`UPDATE product_variants SET stock = 0 WHERE id = ${l.id}`;
      current = await cart.getCart(visitor);
      expect(current.canCheckout).toBe(false);
      expect(current.lines.find((line) => line.variantId === l.id)?.issue?.code).toBe('out_of_stock');
      await admin.updateProduct(p.id, { name: p.name, categoryId, description: '', material: '', priceVnd: 400000, compareAtPriceVnd: null, status: 'draft' });
      expect((await cart.getCart(visitor)).lines.every((line) => line.issue?.code === 'unavailable')).toBe(true);
    });
  });

  describe('checkout', () => {
    it('creates the order, prices it, takes stock, clears the cart and records a pending payment for online methods', async () => {
      const p = await product('K-1', { priceVnd: 400000, compareAtPriceVnd: 500000 });
      const [m] = await variantsOf(p.id);
      const visitor = randomUUID();
      await buy(visitor, [m.id, 2]);
      const { code, replayed } = await checkoutMod.checkout(visitor, info({ paymentMethod: 'card' }));
      expect(replayed).toBe(false);
      expect(code).toMatch(/^FT-\d{4}-\d+$/);
      expect(await stockOf(m.id)).toBe(8);
      expect((await cart.getCart(visitor)).lines).toEqual([]);

      const order = await orders.getCustomerOrder(code, { visitorId: visitor });
      expect(order).toMatchObject({ status: 'processing', paymentMethod: 'card', paymentStatus: 'unpaid', subtotalVnd: 800000, shippingFeeVnd: 0, totalVnd: 800000, canPay: true, canCancel: true, phoneMasked: '090••••567' });
      expect(order.items).toEqual([expect.objectContaining({ productCode: 'K-1', size: 'M', quantity: 2, unitPriceVnd: 400000, lineTotalVnd: 800000 })]);
      const [item] = await sql<{ discount_percent: number; variant_id: string }[]>`SELECT discount_percent, variant_id FROM order_items WHERE order_id = ${code}`;
      expect(item).toMatchObject({ discount_percent: 20, variant_id: m.id });
      expect(await sql`SELECT 1 FROM payments WHERE order_id = ${code} AND status = 'pending' AND amount_vnd = 800000`).toHaveLength(1);
    });

    it('charges shipping under the threshold and records no payment row for COD', async () => {
      const p = await product('K-2', { priceVnd: 200000 });
      const [m] = await variantsOf(p.id);
      const visitor = randomUUID();
      await buy(visitor, [m.id, 1]);
      const { code } = await checkoutMod.checkout(visitor, info());
      expect(await orders.getCustomerOrder(code, { visitorId: visitor })).toMatchObject({ subtotalVnd: 200000, shippingFeeVnd: 30000, totalVnd: 230000, canPay: false });
      expect(await sql`SELECT 1 FROM payments WHERE order_id = ${code}`).toHaveLength(0);
    });

    it('follows the shipping settings staff change', async () => {
      await settings.saveShopSettings({ shippingFeeVnd: 15000, freeShippingFromVnd: 100000, maxOrdersPerHour: 5 });
      const p = await product('K-3', { priceVnd: 120000 });
      const [m] = await variantsOf(p.id);
      const visitor = randomUUID();
      await buy(visitor, [m.id, 1]);
      expect(await cart.getCart(visitor)).toMatchObject({ shippingFeeVnd: 0, freeShippingFromVnd: 100000 });
      await settings.saveShopSettings({ shippingFeeVnd: 15000, freeShippingFromVnd: 500000, maxOrdersPerHour: 5 });
      expect(await cart.getCart(visitor)).toMatchObject({ shippingFeeVnd: 15000, totalVnd: 135000 });
    });

    it('replays the same idempotency key without taking stock twice, and rejects an empty cart', async () => {
      const p = await product('K-4');
      const [m] = await variantsOf(p.id);
      const visitor = randomUUID();
      const key = randomUUID();
      await buy(visitor, [m.id, 1]);
      const first = await checkoutMod.checkout(visitor, info({ idempotencyKey: key }));
      const second = await checkoutMod.checkout(visitor, info({ idempotencyKey: key }));
      expect(second).toEqual({ code: first.code, replayed: true });
      expect(await stockOf(m.id)).toBe(9);
      await expect(checkoutMod.checkout(visitor, info())).rejects.toMatchObject({ status: 400 });
    });

    it('fails cleanly when stock vanished after the item was added: nothing changes', async () => {
      const p = await product('K-5');
      const [m, l] = await variantsOf(p.id);
      const visitor = randomUUID();
      await buy(visitor, [m.id, 3], [l.id, 1]);
      await sql`UPDATE product_variants SET stock = 2 WHERE id = ${m.id}`;
      await expect(checkoutMod.checkout(visitor, info())).rejects.toMatchObject({ status: 409 });
      expect(await stockOf(m.id)).toBe(2);
      expect(await stockOf(l.id)).toBe(10);
      expect((await cart.getCart(visitor)).lines).toHaveLength(2);
      expect(await sql`SELECT 1 FROM orders WHERE visitor_id = ${visitor}`).toHaveLength(0);
    });

    it('never oversells: two visitors racing for the last unit give exactly one order', async () => {
      const p = await product('K-6', { variants: [v('M', 'Đen', 1)] });
      const [m] = await variantsOf(p.id);
      const a = randomUUID(); const b = randomUUID();
      await sql`UPDATE product_variants SET stock = 5 WHERE id = ${m.id}`;
      await buy(a, [m.id, 1]); await buy(b, [m.id, 1]);
      await sql`UPDATE product_variants SET stock = 1 WHERE id = ${m.id}`;
      const results = await Promise.allSettled([checkoutMod.checkout(a, info()), checkoutMod.checkout(b, info())]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
      expect(await stockOf(m.id)).toBe(0);
      expect(await sql`SELECT 1 FROM orders WHERE visitor_id IN (${a}, ${b})`).toHaveLength(1);
    });

    it('lets one order hold the same product in two sizes', async () => {
      const p = await product('K-7');
      const [m, l] = await variantsOf(p.id);
      const visitor = randomUUID();
      await buy(visitor, [m.id, 1], [l.id, 1]);
      const { code } = await checkoutMod.checkout(visitor, info());
      expect((await orders.getCustomerOrder(code, { visitorId: visitor })).items.map((item) => item.size).sort()).toEqual(['L', 'M']);
    });

    it('limits how many orders one visitor can place per hour', async () => {
      await settings.saveShopSettings({ shippingFeeVnd: 30000, freeShippingFromVnd: 799000, maxOrdersPerHour: 1 });
      const p = await product('K-8');
      const [m] = await variantsOf(p.id);
      const visitor = randomUUID();
      await buy(visitor, [m.id, 1]);
      await checkoutMod.checkout(visitor, info());
      await buy(visitor, [m.id, 1]);
      await expect(checkoutMod.checkout(visitor, info())).rejects.toMatchObject({ status: 429 });
    });
  });

  describe('customer order actions', () => {
    const place = async (paymentMethod: 'COD' | 'card' = 'COD', qty = 2) => {
      const p = await product(`O-${Math.floor(Math.random() * 1e6)}`);
      const [m] = await variantsOf(p.id);
      const visitor = randomUUID();
      await buy(visitor, [m.id, qty]);
      const { code } = await checkoutMod.checkout(visitor, info({ paymentMethod }));
      return { code, visitor, variantId: m.id };
    };

    it('cancels an unpaid order, restores stock and is safe to repeat', async () => {
      const { code, visitor, variantId } = await place('card');
      expect(await stockOf(variantId)).toBe(8);
      expect(await orders.cancelCustomerOrder(code, { visitorId: visitor })).toMatchObject({ status: 'cancelled', canCancel: false });
      expect(await stockOf(variantId)).toBe(10);
      await orders.cancelCustomerOrder(code, { visitorId: visitor });
      expect(await stockOf(variantId)).toBe(10);
      expect(await sql`SELECT 1 FROM payments WHERE order_id = ${code} AND status = 'failed'`).toHaveLength(1);
    });

    it('refuses to cancel paid or already shipped orders', async () => {
      const paid = await place('card');
      await orders.payCustomerOrder(paid.code, { visitorId: paid.visitor }, 'success');
      await expect(orders.cancelCustomerOrder(paid.code, { visitorId: paid.visitor })).rejects.toMatchObject({ status: 409 });
      const shipped = await place();
      await sql`UPDATE orders SET status = 'shipping' WHERE id = ${shipped.code}`;
      await expect(orders.cancelCustomerOrder(shipped.code, { visitorId: shipped.visitor })).rejects.toMatchObject({ status: 409 });
    });

    it('runs the simulated payment: failure can be retried, success is idempotent, COD cannot be paid online', async () => {
      const { code, visitor } = await place('card');
      expect(await orders.payCustomerOrder(code, { visitorId: visitor }, 'failure')).toMatchObject({ paymentStatus: 'failed', canPay: true });
      const paid = await orders.payCustomerOrder(code, { visitorId: visitor }, 'success');
      expect(paid).toMatchObject({ paymentStatus: 'paid', canPay: false, canCancel: false });
      await orders.payCustomerOrder(code, { visitorId: visitor }, 'failure');
      expect((await orders.getCustomerOrder(code, { visitorId: visitor })).paymentStatus).toBe('paid');
      expect(await sql`SELECT 1 FROM payments WHERE order_id = ${code} AND status = 'succeeded'`).toHaveLength(1);
      const cod = await place('COD');
      await expect(orders.payCustomerOrder(cod.code, { visitorId: cod.visitor }, 'success')).rejects.toMatchObject({ status: 409 });
    });

    it('with the payment simulation off: online checkout is refused, pay is 404 and audited, a replay still works', async () => {
      const { env } = await import('@/lib/env');
      const { code, visitor } = await place('card');
      const replayKey = randomUUID();
      const p = await product(`R-${Math.floor(Math.random() * 1e6)}`);
      const [variant] = await variantsOf(p.id);
      const buyer = randomUUID();
      await buy(buyer, [variant.id, 1]);
      const first = await checkoutMod.checkout(buyer, info({ paymentMethod: 'card', idempotencyKey: replayKey }));
      env.PAYMENT_SIMULATION_ENABLED = false;
      try {
        expect(await orders.getCustomerOrder(code, { visitorId: visitor })).toMatchObject({ canPay: false, canCancel: true });
        await expect(orders.payCustomerOrder(code, { visitorId: visitor }, 'success')).rejects.toMatchObject({ status: 404 });
        expect((await orders.getCustomerOrder(code, { visitorId: visitor })).paymentStatus).toBe('unpaid');
        expect(await sql`SELECT 1 FROM audit_logs WHERE action = 'payment.simulation_blocked' AND entity_id = ${code}`).toHaveLength(1);
        expect((await checkoutMod.checkout(buyer, info({ paymentMethod: 'card', idempotencyKey: replayKey }))).code).toBe(first.code);
        const other = randomUUID();
        await buy(other, [variant.id, 1]);
        await expect(checkoutMod.checkout(other, info({ paymentMethod: 'bank_transfer' }))).rejects.toMatchObject({ status: 409 });
        expect((await checkoutMod.checkout(other, info({ paymentMethod: 'COD' }))).code).toBeTruthy();
      } finally {
        env.PAYMENT_SIMULATION_ENABLED = true;
      }
    });

    it('only shows an order to its owner or to someone who knows the phone, with one shared error', async () => {
      const { code, visitor } = await place();
      expect((await orders.getCustomerOrder(code, { visitorId: visitor })).code).toBe(code);
      expect((await orders.getCustomerOrder(code, { phone: '+84 901 234 567' })).code).toBe(code);
      await expect(orders.getCustomerOrder(code, { visitorId: randomUUID() })).rejects.toMatchObject({ status: 404 });
      await expect(orders.getCustomerOrder(code, { phone: '0999999999' })).rejects.toMatchObject({ status: 404 });
      await expect(orders.getCustomerOrder('FT-0000-0', { phone: '0901234567' })).rejects.toMatchObject({ status: 404 });
      await expect(orders.cancelCustomerOrder(code, { visitorId: randomUUID() })).rejects.toMatchObject({ status: 404 });
    });

    it('throttles repeated wrong lookups per order code, then still answers correctly for a legit phone later', async () => {
      const { code } = await place();
      for (let attempt = 0; attempt < 5; attempt += 1) await expect(orders.lookupCustomerOrder(code, `09000000${attempt}0`, '10.0.0.1')).rejects.toMatchObject({ status: 404 });
      await expect(orders.lookupCustomerOrder(code, '0901234567', '10.0.0.1')).rejects.toMatchObject({ status: 429 });
      const other = await place();
      expect((await orders.lookupCustomerOrder(other.code, '0901234567', '10.0.0.2')).code).toBe(other.code);
    });
  });

  it('puts the live shipping numbers in a policy chunk for the chatbot', async () => {
    await settings.saveShopSettings({ shippingFeeVnd: 25000, freeShippingFromVnd: 600000, maxOrdersPerHour: 5 });
    const shipping = (await chunks.buildCatalogChunks()).find((chunk) => chunk.sourceId === 'policy:phi-giao-hang-hien-hanh:1');
    expect(shipping?.sourceType).toBe('policy');
    expect(shipping?.content).toContain('600.000 VNĐ');
    expect(shipping?.content).toContain('25.000 VNĐ');
  });
});
