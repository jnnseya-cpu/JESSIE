-- ============================================================
-- 0021 — Where people are lost.
--
-- The site has run without a single customer and without any way to tell
-- why, which are related facts. Blog view counts existed but were held in
-- memory, so they did not survive a restart and on serverless they were
-- per-instance — which is to say there were no numbers at all. "Nobody is
-- signing up" and "nobody is visiting" and "everybody visits and leaves at
-- the same screen" are three different problems with three different
-- answers, and nothing here could tell them apart.
--
-- Five steps, deliberately few. A funnel with twenty stages is a research
-- project; this one answers the only question that matters early: of the
-- people who land, how many reach the account page, and of those, how many
-- finish. A drop between any two of them points at one screen.
--
-- Privacy is the same construction the rest of the platform uses, because
-- a marketing funnel is exactly where a company starts quietly building a
-- profile. The source is hashed with a salt that rotates daily, so a
-- session correlates within a day and stops correlating across weeks.
-- There is no cookie, no identifier, no full referring URL, and no link to
-- an account — the registration step is counted, never attributed. Rows
-- expire at 180 days.
-- ============================================================

CREATE TABLE IF NOT EXISTS funnel_events (
  id        bigserial   PRIMARY KEY,

  -- landed:     any public page
  -- viewed_ask: a page with a join call to action was actually seen
  -- opened:     the account page was opened
  -- started:    the registration form was opened rather than sign-in
  -- registered: an account exists. Recorded server-side, never trusted
  --             from the browser.
  step      text        NOT NULL CHECK (
    step IN ('landed', 'viewed_ask', 'opened', 'started', 'registered')
  ),

  -- Hashed, daily salt. See the note above.
  source    text        NOT NULL,

  -- The path, without a query string: '/foodlens', '/blog/why-the-streak-forgives'.
  -- Query strings carry campaign tags and sometimes carry email addresses.
  path      text        NOT NULL DEFAULT '',

  -- The referring host alone — 'google.com', not the URL somebody came
  -- from. The host answers "which channel"; the URL is somebody's history.
  referrer  text,

  device    text CHECK (device IN ('mobile', 'tablet', 'desktop', 'unknown')),

  at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS funnel_events_recent ON funnel_events (at DESC);
CREATE INDEX IF NOT EXISTS funnel_events_by_step ON funnel_events (step, at DESC);
