-- Only a keyed HMAC is stored, never a raw visitor id, phone number or IP address.
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  key_hash char(64) PRIMARY KEY,
  count integer NOT NULL CHECK (count >= 0),
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rate_limit_buckets_expires_at_idx ON rate_limit_buckets (expires_at);
