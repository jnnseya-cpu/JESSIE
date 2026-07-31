-- ============================================================
-- 0004 — Durable runtime state.
--
-- Three things that must survive a serverless instance being
-- recycled:
--
--   app_wallets      — each ACU wallet as a write-through snapshot.
--                      The spend rules live in the service and are
--                      unit-tested; this row is what makes a granted
--                      balance outlive the process that granted it.
--   processed_events — the Stripe webhook's duplicate-event memory.
--                      A replayed event finds its id here and grants
--                      nothing twice, whichever instance receives it.
--   guardian_confirmed — the minor-activation flag the guardian
--                      confirmation link sets.
-- ============================================================

CREATE TABLE IF NOT EXISTS app_wallets (
  id           text PRIMARY KEY,
  subject_type text NOT NULL CHECK (subject_type IN ('user', 'family', 'organisation')),
  subject_id   text NOT NULL,
  data         jsonb NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT app_wallets_one_per_subject UNIQUE (subject_type, subject_id)
);

CREATE TABLE IF NOT EXISTS processed_events (
  event_id    text PRIMARY KEY,
  kind        text,
  received_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS guardian_confirmed boolean NOT NULL DEFAULT false;
