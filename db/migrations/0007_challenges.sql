-- Team challenges, made joinable.
--
-- The scoring rules already existed and are deliberate: capability is
-- absent from the score, no individual is ranked, and one strong member
-- cannot carry a team (the contribution ceiling). What was missing was
-- somewhere to put a challenge, a way to join one, and a record of who
-- turned up. That is all this schema is.
--
-- A join code rather than an invite system: a family or a small team
-- shares six characters and everyone is in. No directory of people, no
-- searching for strangers, nothing public.

CREATE TABLE IF NOT EXISTS challenges (
  id          text PRIMARY KEY,
  template    text        NOT NULL,
  name        text        NOT NULL,
  owner_id    text        NOT NULL,
  join_code   text        NOT NULL UNIQUE,
  starts_on   date        NOT NULL DEFAULT current_date,
  ends_on     date        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT challenges_run_forwards CHECK (ends_on >= starts_on)
);

CREATE TABLE IF NOT EXISTS challenge_members (
  challenge_id text        NOT NULL REFERENCES challenges (id) ON DELETE CASCADE,
  user_id      text        NOT NULL,
  display_name text        NOT NULL,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (challenge_id, user_id)
);

-- One row per act. Days active is derived from distinct dates, so a
-- person who moves five times in one day counts as one day — the
-- consistency term rewards showing up often, never volume.
CREATE TABLE IF NOT EXISTS challenge_activity (
  id           bigserial PRIMARY KEY,
  challenge_id text        NOT NULL REFERENCES challenges (id) ON DELETE CASCADE,
  user_id      text        NOT NULL,
  kind         text        NOT NULL CHECK (kind IN ('moved', 'support')),
  on_day       date        NOT NULL DEFAULT current_date,
  at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS challenge_activity_lookup
  ON challenge_activity (challenge_id, user_id, on_day);

CREATE INDEX IF NOT EXISTS challenge_members_by_user
  ON challenge_members (user_id);
