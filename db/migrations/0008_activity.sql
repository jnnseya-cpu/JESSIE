-- What a member actually did.
--
-- Every chart the platform promises — the day's timeline, the fourteen-day
-- completion curve, the movement mix, the readings that make up Body
-- Balance — needs a history, and until now nothing was written down. A
-- Snap was issued and the platform immediately forgot it existed.
--
-- One narrow table rather than one per feature: the questions asked of it
-- are all "what happened, when, of what kind", and a single log keeps a
-- day's story in one ordering.

CREATE TABLE IF NOT EXISTS member_activity (
  id        bigserial PRIMARY KEY,
  user_id   text        NOT NULL,
  -- snap_offered: the engine issued one. snap_completed: they did it.
  -- snap_held: the engine deliberately stayed silent, which is a success
  -- and is recorded as one. food_checked: a meal went through FoodLens.
  kind      text        NOT NULL CHECK (
    kind IN ('snap_offered', 'snap_completed', 'snap_held', 'food_checked', 'body_read')
  ),
  -- Movement category for a Snap (mobility, strength, balance…), null
  -- for anything that is not a movement.
  category  text,
  -- Seconds of movement where the act had a duration.
  seconds   integer     NOT NULL DEFAULT 0 CHECK (seconds >= 0 AND seconds <= 7200),
  on_day    date        NOT NULL DEFAULT current_date,
  at        timestamptz NOT NULL DEFAULT now(),
  -- The reason a prompt was held, so "held" is explainable rather than
  -- merely counted.
  detail    text        NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS member_activity_by_user_day
  ON member_activity (user_id, on_day DESC);

CREATE INDEX IF NOT EXISTS member_activity_by_user_kind
  ON member_activity (user_id, kind, on_day DESC);
