-- Phase 4: cart, checkout, payments and shop settings.

CREATE TABLE IF NOT EXISTS shop_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One cart per anonymous visitor (the HttpOnly visitor cookie).
CREATE TABLE IF NOT EXISTS carts (
  visitor_id text PRIMARY KEY,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cart_items (
  id uuid PRIMARY KEY,
  visitor_id text NOT NULL REFERENCES carts(visitor_id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES product_variants(id),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (visitor_id, variant_id)
);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS note text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS visitor_id text,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'failed')),
  ADD COLUMN IF NOT EXISTS subtotal_vnd integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_vnd integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_idx ON orders(visitor_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_phone_idx ON orders(phone);
CREATE INDEX IF NOT EXISTS orders_visitor_idx ON orders(visitor_id, ordered_at DESC);

-- The same product may now appear on several lines of one order (different size/colour).
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES product_variants(id);
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_order_id_product_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS order_items_line_idx ON order_items(order_id, product_id, size, color);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
  amount_vnd integer NOT NULL CHECK (amount_vnd >= 0),
  provider_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_order_idx ON payments(order_id, created_at);

-- Real orders start after the demo range (FT-2026-1001..1012).
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 2001;

-- Give pre-existing demo orders the customer fields the lookup flow needs (fake data, no real PII).
UPDATE orders o SET
  customer_name = 'Khách demo',
  phone = '0900' || right(regexp_replace(o.id, '\D', '', 'g'), 6),
  address = '123 Đường Demo, Quận 1, TP. Hồ Chí Minh',
  subtotal_vnd = coalesce((SELECT sum(i.quantity * i.unit_price_vnd) FROM order_items i WHERE i.order_id = o.id), 0),
  total_vnd = coalesce((SELECT sum(i.quantity * i.unit_price_vnd) FROM order_items i WHERE i.order_id = o.id), 0) + o.shipping_fee_vnd,
  payment_status = CASE WHEN o.payment_method = 'COD' AND o.status = 'delivered' THEN 'paid' WHEN o.payment_method <> 'COD' AND o.status <> 'cancelled' THEN 'paid' ELSE 'unpaid' END
WHERE o.phone IS NULL;
