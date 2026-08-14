-- ============================================================
-- 0024 — What the autopilot actually did.
--
-- The run history and the last-run timestamp were fields on a service
-- instance. On a serverless deployment that is the same as not existing:
-- every cold start begins with an empty history and `lastRunAt = null`.
--
-- Two consequences, and the second is worse than the first.
--
-- The history is always empty, so the console cannot show a run. A week
-- in which the agent drafted an article every day and had every one
-- rejected at 73/100 looks exactly like a week in which nothing ran at
-- all — an empty queue and no explanation — and the obvious conclusion is
-- that the agent does not work. That is the failure this whole piece of
-- work exists to stop repeating.
--
-- And the cadence check reads `lastRunAt`, so a null one means "never
-- run", which means run now. The weekly interval was enforced only for as
-- long as one instance happened to stay warm. The queue ceiling bounded
-- the damage, but the interval was decorative.
--
-- Rows expire at 180 days. Long enough to see whether the agent is
-- producing anything usable, short enough that this does not become an
-- archive nobody reads.
-- ============================================================

CREATE TABLE IF NOT EXISTS autopilot_runs (
  id          bigserial   PRIMARY KEY,

  at          timestamptz NOT NULL DEFAULT now(),

  outcome     text        NOT NULL CHECK (outcome IN ('queued', 'rejected', 'skipped', 'failed')),

  -- The sentence shown to a person. Every outcome carries one, including
  -- the boring ones: "ran within the last week" is the answer to why
  -- nothing happened, and somebody looking for that answer should find it
  -- rather than an empty screen.
  says        text        NOT NULL DEFAULT '',

  -- What it was asked to write, where it got that far.
  keyword     text,
  cluster_key text,
  slug        text,

  -- The audit score, and the blockers that stopped it being queued.
  score       integer,
  blockers    jsonb       NOT NULL DEFAULT '[]'::jsonb,

  acu_spent   numeric     NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS autopilot_runs_recent ON autopilot_runs (at DESC);
