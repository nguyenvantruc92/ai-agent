-- Week 7: simulated orders, human approval, exchange/return requests and audit.
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS orders (
  id text PRIMARY KEY,
  customer_ref text NOT NULL,
  status text NOT NULL CHECK (status IN ('processing', 'shipping', 'delivered', 'cancelled')),
  ordered_at timestamptz NOT NULL,
  delivered_at timestamptz,
  payment_method text NOT NULL,
  shipping_fee_vnd integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  product_name text NOT NULL,
  size text NOT NULL,
  color text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_vnd integer NOT NULL,
  discount_percent integer NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 100),
  is_opened boolean NOT NULL DEFAULT false,
  UNIQUE (order_id, product_id)
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id uuid PRIMARY KEY,
  thread_id uuid NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('exchange_size', 'return')),
  payload jsonb NOT NULL,
  summary text NOT NULL,
  source_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  reviewer text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  expires_at timestamptz NOT NULL
);
-- Re-sending the same request reuses the live approval; rejected/expired ones may be proposed again.
CREATE UNIQUE INDEX IF NOT EXISTS approval_requests_live_key ON approval_requests(idempotency_key) WHERE status IN ('pending', 'approved');
CREATE INDEX IF NOT EXISTS approval_requests_status_idx ON approval_requests(status, created_at);
CREATE INDEX IF NOT EXISTS approval_requests_thread_idx ON approval_requests(thread_id);

CREATE TABLE IF NOT EXISTS exchange_return_requests (
  id uuid PRIMARY KEY,
  approval_request_id uuid REFERENCES approval_requests(id),
  idempotency_key text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type IN ('exchange_size', 'return')),
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  requested_size text,
  reason text,
  status text NOT NULL DEFAULT 'created',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY,
  actor text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs(entity_type, entity_id);
