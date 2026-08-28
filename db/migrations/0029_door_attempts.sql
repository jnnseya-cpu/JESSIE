-- ============================================================
-- 0029 — The rate limit has to survive the instance.
--
-- `assertHuman` counts attempts in a Map on the instance that served the
-- request. The policy reads "twelve logins in ten minutes"; what it
-- actually enforces on serverless is twelve per warm instance, reset
-- whenever one is recycled. An attacker does not have to do anything
-- clever to benefit — ordinary load balancing spreads their attempts
-- across instances, and a cold start hands back a clean counter.
--
-- This is the same defect as the wallet cache in 0027, in a different
-- place: state that has to be global, held per process. The fix is the
-- same shape — one row, counted in the database, so the limit is the
-- limit however many instances are running.
--
-- One row per attempt rather than a counter, because the window slides.
-- A counter would need a reset job and would be wrong for the whole
-- window after each reset. Rows are cheap and old ones are swept on
-- write, so the table stays about as large as one window of traffic.
-- ============================================================

CREATE TABLE IF NOT EXISTS door_attempts (
  id         bigserial PRIMARY KEY,
  -- The door being knocked on: register, login, forgot and their
  -- siblings. Kept as text rather than an enum so adding a door is a code
  -- change and not a migration.
  door       text NOT NULL,
  -- Who is knocking. The remote address, never an account — limiting by
  -- account would let anybody lock anybody else out by failing logins on
  -- their behalf, which turns a protection into a denial of service.
  source     text NOT NULL,
  at         timestamptz NOT NULL DEFAULT now()
);

-- The only query: how many attempts on this door from this source inside
-- the window. Ordered so the sweep can find old rows on the same index.
CREATE INDEX IF NOT EXISTS door_attempts_window_idx
  ON door_attempts (door, source, at DESC);

CREATE INDEX IF NOT EXISTS door_attempts_sweep_idx ON door_attempts (at);
