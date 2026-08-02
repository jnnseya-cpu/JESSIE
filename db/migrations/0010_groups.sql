-- Households and organisations.
--
-- One shape, two reporting rules, and the difference is the whole point:
--
--   household     — a family sees each other by name. That is what makes
--                   a grandparent-and-grandchild streak possible.
--   organisation  — an employer sees aggregates above a k-anonymity floor
--                   and nothing else. There is no individual view to
--                   permission-gate; the query never produces one.
--
-- A join code rather than an invite directory: six characters passed
-- across a kitchen or a team meeting, no searching for people, nothing
-- public.

CREATE TABLE IF NOT EXISTS groups (
  id         text PRIMARY KEY,
  kind       text        NOT NULL CHECK (kind IN ('household', 'organisation')),
  name       text        NOT NULL,
  owner_id   text        NOT NULL,
  join_code  text        NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id     text        NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  user_id      text        NOT NULL,
  display_name text        NOT NULL,
  -- Only ever used to slice an organisation report, never to identify.
  department   text,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS group_members_by_user ON group_members (user_id);
