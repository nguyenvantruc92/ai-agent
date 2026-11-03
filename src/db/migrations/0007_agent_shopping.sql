-- Phase 6: the agent can sell. Exchange/return requests identify the exact order line, and every
-- customer-facing write (checkout, cancel) waits for an explicit confirmation made in the browser.
ALTER TABLE exchange_return_requests
  ADD COLUMN IF NOT EXISTS item_size text,
  ADD COLUMN IF NOT EXISTS item_color text;

CREATE TABLE IF NOT EXISTS customer_confirmations (
  id uuid PRIMARY KEY,
  thread_id uuid NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('checkout', 'cancel_order')),
  -- What the customer saw and agreed to; the MCP write tools execute exactly this, never model-supplied arguments.
  payload jsonb NOT NULL,
  summary text NOT NULL,
  details jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Cart (checkout) or order (cancel) state at the time of the question; execution is refused if it changed.
  fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired', 'executed', 'failed')),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  expires_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_confirmations_one_pending ON customer_confirmations(thread_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS customer_confirmations_thread_idx ON customer_confirmations(thread_id, created_at);
