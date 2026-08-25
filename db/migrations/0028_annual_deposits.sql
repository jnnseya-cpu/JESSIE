-- ============================================================
-- 0028 — Annual allowance, delivered monthly.
--
-- An annual invoice used to grant the whole year's ACU at once. Two
-- things followed, and one of them is a fraud path:
--
--   * Buy the annual plan, spend the entire year's allowance inside a
--     week, then charge back. The reversal recovers what is left, which
--     by then is nothing, and the shortfall is a year of compute. Nothing
--     about that sequence is difficult or expensive to attempt.
--   * A subscription grant lives 90 days, so eleven twelfths of the
--     allowance expired before the member could reach it. The plan sold
--     one thing and delivered a quarter of it.
--
-- `depositAnnualMonth` had existed for exactly this since the wallet was
-- written, and was called by nothing.
--
-- There is no scheduler on this deployment and a cron nobody runs is a
-- promise nobody keeps, so deposits are released on read — the same
-- pattern the free tier and the platform's own daily budget already use.
-- The row is the record of what is owed; `granted_at` is what stops it
-- being paid twice.
-- ============================================================

CREATE TABLE IF NOT EXISTS annual_deposits (
  id          bigserial PRIMARY KEY,
  user_id     text NOT NULL,
  plan        text NOT NULL,
  -- The invoice that paid for the year. A renewal is a new invoice and so
  -- a new schedule; a redelivered webhook is the same one.
  invoice_id  text NOT NULL,
  month_index int  NOT NULL CHECK (month_index BETWEEN 1 AND 11),
  acus        int  NOT NULL CHECK (acus > 0),
  due_at      timestamptz NOT NULL,
  granted_at  timestamptz,

  CONSTRAINT annual_deposits_once UNIQUE (invoice_id, month_index)
);

-- The read path asks one question: what does this member have due now.
CREATE INDEX IF NOT EXISTS annual_deposits_due_idx
  ON annual_deposits (user_id, due_at) WHERE granted_at IS NULL;
