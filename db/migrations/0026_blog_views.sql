-- ============================================================
-- 0026 — Blog views, and the salt that anonymises them.
--
-- View counts were an array on a service instance. On a serverless
-- deployment that is the same as not counting: every cold start begins
-- with zero, concurrent instances each keep their own tally, and the
-- number on the analytics screen is whatever happened to reach one
-- container since it last woke. The reported symptom was "view count
-- isn't working", and it was right.
--
-- TWO TABLES, BECAUSE THE SALT IS PART OF THE MEASUREMENT.
--
-- Unique visitors are counted by hashing the caller's address and user
-- agent with a salt that changes daily — usable within a day, useless
-- across days, and the raw address is never stored. That works only while
-- every instance agrees on today's salt. Held in memory, each container
-- generated its own, so the same reader hashed differently on every
-- request and every view looked unique. Persisting the salt is what makes
-- the unique count mean anything once there is more than one instance.
--
-- Yesterday's salts are deleted rather than kept. That is the property
-- that makes cross-day correlation impossible for anybody, including us
-- with full database access: once the salt is gone, two digests for the
-- same reader on different days cannot be connected even in principle.
--
-- WHAT IS DELIBERATELY ABSENT: no IP address, no cookie, no account id,
-- no full referring URL. The privacy notice says the marketing site does
-- not profile readers, and this schema is what makes that a fact rather
-- than an intention.
-- ============================================================

CREATE TABLE IF NOT EXISTS blog_view_salts (
  day        date        PRIMARY KEY,
  salt       bytea       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS blog_views (
  id             bigserial   PRIMARY KEY,

  -- Not a foreign key to posts: the hand-written corpus is rendered by the
  -- site and has no row here, and a view of a real article must not be
  -- refused because of where its prose happens to live.
  slug           text        NOT NULL CHECK (slug ~ '^[a-z0-9-]{3,80}$'),

  -- The hashed reader. Thirty-two hex characters, salted with the day.
  visitor        text        NOT NULL CHECK (visitor ~ '^[0-9a-f]{32}$'),

  dwell_seconds  integer     NOT NULL DEFAULT 0
                             CHECK (dwell_seconds BETWEEN 0 AND 7200),
  scroll_percent integer     NOT NULL DEFAULT 0
                             CHECK (scroll_percent BETWEEN 0 AND 100),

  device         text        CHECK (device IN ('mobile','tablet','desktop','unknown')),

  -- Referring host alone. The host answers "which channel"; the full URL
  -- is somebody's browsing history.
  referrer       text,

  at             timestamptz NOT NULL DEFAULT now(),

  -- Half-hour bucket: floor(epoch_ms / 1_800_000). See the index below.
  window_key     bigint      NOT NULL
);

-- One row per reader per article per half-hour bucket. A reader who
-- scrolls back up is not a second reader, and the dedupe used to live in a
-- JavaScript array scan — which cannot hold across two containers serving
-- the same person. It belongs in the database, where concurrency cannot
-- get around it.
--
-- The bucket is a plain integer supplied by the application rather than an
-- expression over `at`. Postgres refuses to index `date_trunc` on a
-- timestamptz — the result depends on the session's timezone, so the
-- function is STABLE rather than IMMUTABLE and an index built on it could
-- disagree with itself. Half-hour buckets rather than a sliding window is
-- the small honest cost: two reads twenty-nine minutes apart can land
-- either side of a boundary and count twice.
CREATE UNIQUE INDEX IF NOT EXISTS blog_views_once_per_window
  ON blog_views (slug, visitor, window_key);

CREATE INDEX IF NOT EXISTS blog_views_by_slug ON blog_views (slug, at DESC);
CREATE INDEX IF NOT EXISTS blog_views_recent  ON blog_views (at DESC);
