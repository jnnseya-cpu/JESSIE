-- ============================================================
-- 0017 — Strength and balance checks.
--
-- Three functional measures, recorded by the member, kept so that the
-- twelve-week re-check has something to compare against. Falls and
-- fractures cost the NHS around two billion pounds a year, and the
-- documented failure is not that nobody knows what works — it is that
-- community programmes are hard to stay with and stop when the block
-- ends. A record that persists is most of what a programme is.
--
-- What is deliberately absent is a risk score. A real falls assessment
-- includes medication review, lying and standing blood pressure, vision,
-- feet and the home; this table can see none of that. Storing a "risk"
-- column would invite somebody to read a reassuring number and skip the
-- assessment they were offered, and that is the one output here that
-- could contribute to a fall.
--
-- `fallen_last_year` is the strongest single predictor of the next fall
-- and is stored because the platform must keep saying so, not because it
-- is scored. Special-category data: it cascades with the account and
-- never appears in a household or organisation view.
-- ============================================================

CREATE TABLE IF NOT EXISTS falls_checks (
  id                 text PRIMARY KEY,
  user_id            text NOT NULL REFERENCES app_users (user_id) ON DELETE CASCADE,
  taken_at           timestamptz NOT NULL DEFAULT now(),

  -- Each measure is optional: somebody may manage the chair stand and not
  -- feel safe attempting single-leg balance, and that is a legitimate
  -- record rather than an incomplete one.
  chair_stand_reps   integer CHECK (chair_stand_reps  IS NULL OR chair_stand_reps  BETWEEN 0 AND 60),
  balance_seconds    numeric CHECK (balance_seconds   IS NULL OR balance_seconds   BETWEEN 0 AND 40),
  up_and_go_seconds  numeric CHECK (up_and_go_seconds IS NULL OR up_and_go_seconds BETWEEN 0 AND 300),

  fallen_last_year   boolean NOT NULL DEFAULT false,
  afraid_of_falling  boolean NOT NULL DEFAULT false,

  -- The level the platform derived at the time. Kept so a later change to
  -- the thresholds cannot silently rewrite somebody's history.
  level              text NOT NULL,

  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS falls_checks_user_idx
  ON falls_checks (user_id, taken_at DESC);
