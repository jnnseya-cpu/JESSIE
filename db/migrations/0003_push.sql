-- ============================================================
-- 0003 — Push subscriptions.
--
-- One row per device that agreed to be woken. The endpoint is the
-- push service URL the browser issued; p256dh/auth are the
-- subscription's own encryption keys, and every payload is encrypted
-- to them (RFC 8291) so the push service relays bytes it cannot read.
-- Deleted on unsubscribe and on a 404/410 from the push service.
-- ============================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint   text PRIMARY KEY,
  user_id    text,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT push_endpoint_https CHECK (endpoint LIKE 'https://%')
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (user_id);
