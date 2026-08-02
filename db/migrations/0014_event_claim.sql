-- ============================================================
-- 0014 — Claim a webhook event before acting on it, not after.
--
-- The duplicate check was read-then-write: ask whether the event had been
-- seen, process it, then record it. Stripe retries, and can deliver the
-- same event to two instances at once — both read "not seen", both grant
-- the plan's allowance, and both then insert with ON CONFLICT DO NOTHING.
-- One payment, two grants. On a launch day with real cards that is money
-- leaving the business for as long as nobody notices.
--
-- The unique key on event_id is already the lock; it was simply being
-- taken too late. Claiming first makes the race impossible.
--
-- The reason it was written the other way round is real, though: recording
-- only after success means a crash mid-event lets Stripe retry it. So the
-- claim carries a state. A claim that succeeded is a duplicate forever. A
-- claim still marked processing after fifteen minutes is a crashed attempt,
-- and the retry is allowed to take it over.
-- ============================================================

ALTER TABLE processed_events
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'done'
    CHECK (status IN ('processing', 'done'));

ALTER TABLE processed_events
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz NOT NULL DEFAULT now();

-- Anything already recorded came from the old code, which only ever wrote
-- a row after the work was finished. Those are done.
UPDATE processed_events SET status = 'done' WHERE status IS NULL;

CREATE INDEX IF NOT EXISTS processed_events_stuck_idx
  ON processed_events (status, claimed_at)
  WHERE status = 'processing';
