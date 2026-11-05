-- Operational alerts fired by the worker (Week 8 Phase 4). One row per firing: it de-duplicates notifications across
-- worker restarts and feeds the "recent alerts" list in Admin → Monitoring. Messages hold numbers only, never PII.
CREATE TABLE IF NOT EXISTS alert_events (
  id uuid PRIMARY KEY,
  alert_key text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('warning', 'critical')),
  message text NOT NULL,
  value double precision,
  threshold double precision,
  notified boolean NOT NULL DEFAULT false,
  fired_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS alert_events_key_idx ON alert_events(alert_key, fired_at DESC);
CREATE INDEX IF NOT EXISTS alert_events_fired_idx ON alert_events(fired_at DESC);
