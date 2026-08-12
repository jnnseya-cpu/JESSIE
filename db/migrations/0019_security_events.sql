-- ============================================================
-- 0019 — What was refused, and why.
--
-- A security layer that blocks things and keeps no record is two
-- indistinguishable systems: one that is working, and one that is
-- silently locking real people out. This table is what tells them apart,
-- and it is the queue the security agent reads.
--
-- What is deliberately NOT stored:
--
--   * The source address in the clear. A refusal log that accumulates
--     addresses is a surveillance database that we would then have to
--     defend, and the questions it has to answer — "is this the same
--     caller as an hour ago" — are answered by a hash just as well.
--     Hashed with the platform secret and a daily salt, so the same
--     caller correlates within a day and not across weeks.
--   * The text that triggered a refusal. A capped fragment goes in
--     `detail` so a reviewer can see the shape of what was tried; the
--     payload itself is not ours to keep, and for member-submitted text
--     it may contain exactly the health information this platform spends
--     the rest of its effort not storing.
--   * Any link to the account. `user_id` is nullable and only set where
--     the event is about a session that already identified itself. A
--     failed login does not know whose it was, and guessing would attach
--     a stranger's failures to a real member's record.
--
-- Rows expire. Ninety days is long enough to see a campaign and short
-- enough that this never becomes a permanent file on anybody. The sweep
-- is in the service rather than a database job so a deployment without a
-- scheduler still forgets on time.
-- ============================================================

CREATE TABLE IF NOT EXISTS security_events (
  id         bigserial   PRIMARY KEY,

  kind       text        NOT NULL CHECK (
    kind IN (
      'human_check_failed',
      'rate_limited',
      'injection_noted',
      'injection_blocked',
      'unbilled_ai_attempt',
      'session_anomaly'
    )
  ),

  -- Deterministic, from the rule that fired. Never a model's opinion.
  severity   text        NOT NULL CHECK (severity IN ('low', 'medium', 'high')),

  -- Hashed. See the note above.
  source     text        NOT NULL,

  -- The surface it arrived at: 'login', 'mova', 'foodlens', 'growth'.
  surface    text,

  -- A sentence a reviewer can act on, and a capped fragment at most.
  detail     text        NOT NULL DEFAULT '',

  -- Set only when the caller had already identified itself.
  user_id    text        REFERENCES app_users (user_id) ON DELETE SET NULL,

  at         timestamptz NOT NULL DEFAULT now(),

  -- What the agent wrote about it, and when. Null until it has been read.
  -- The agent explains; it never decides. Nothing in this table changes
  -- anybody's access — the blocking already happened, deterministically,
  -- before the row was written.
  triage     text,
  triaged_at timestamptz
);

CREATE INDEX IF NOT EXISTS security_events_recent
  ON security_events (at DESC);

CREATE INDEX IF NOT EXISTS security_events_untriaged
  ON security_events (severity, at DESC)
  WHERE triage IS NULL;
