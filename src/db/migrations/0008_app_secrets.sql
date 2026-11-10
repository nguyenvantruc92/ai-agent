-- Secrets staff manage from the admin UI (currently the OpenAI API key). Values are AES-256-GCM encrypted;
-- `hint` is the last four characters so the UI can show which key is active without decrypting.
CREATE TABLE IF NOT EXISTS app_secrets (
  name text PRIMARY KEY,
  value_encrypted text NOT NULL,
  hint text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
