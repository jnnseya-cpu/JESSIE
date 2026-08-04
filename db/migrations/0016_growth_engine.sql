-- ============================================================
-- 0016 — The AI Growth Engine.
--
-- Two tables, and the split between them is the point.
--
-- `growth_results` is what a partner published and what it did. Four
-- observed numbers — reached, clicked, signed up, paid — and nothing that
-- anybody estimated. It exists because four of the ten tools measure
-- rather than write, and a measuring tool with nothing to measure has to
-- either refuse or invent. This table is what lets it refuse honestly:
-- "eight of the fifteen results this needs" is a true sentence, and
-- "post on Tuesdays" from a model that has never seen this partner's
-- history is not.
--
-- `growth_outputs` is what the engine drafted. Kept so a partner can come
-- back to a draft, and so a claim that reached the public can be traced to
-- the run that produced it — which matters the day an advertising
-- regulator asks. Editable text is not stored back over the original: the
-- draft is what we generated, and what the partner published is theirs.
--
-- Both cascade with the account. A partner who leaves takes their campaign
-- history with them.
-- ============================================================

CREATE TABLE IF NOT EXISTS growth_results (
  id           text PRIMARY KEY,
  partner_id   text NOT NULL REFERENCES app_users (user_id) ON DELETE CASCADE,
  tool_id      text,
  platform     text,
  campaign     text,
  subject      text,
  posted_at    timestamptz NOT NULL,

  -- Observed, never modelled. A negative count is a bug upstream, not data.
  reach        integer NOT NULL DEFAULT 0 CHECK (reach   >= 0),
  clicks       integer NOT NULL DEFAULT 0 CHECK (clicks  >= 0),
  signups      integer NOT NULL DEFAULT 0 CHECK (signups >= 0),
  paid         integer NOT NULL DEFAULT 0 CHECK (paid    >= 0),

  -- The funnel only narrows. More clicks than people reached means the
  -- numbers came from two different places and the rates would be
  -- nonsense, so the database refuses the row rather than reporting a
  -- 400% click rate to somebody making decisions on it.
  CONSTRAINT growth_results_funnel CHECK (
    clicks <= reach AND signups <= clicks AND paid <= signups
  ),

  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS growth_results_partner_idx
  ON growth_results (partner_id, posted_at DESC);

CREATE TABLE IF NOT EXISTS growth_outputs (
  id           text PRIMARY KEY,
  partner_id   text NOT NULL REFERENCES app_users (user_id) ON DELETE CASCADE,
  tool_id      text NOT NULL,
  platform     text,
  brief        text NOT NULL,
  -- The generated draft, as JSON, because a landing page and a hashtag
  -- list are not the same shape and flattening both to a string would
  -- lose the structure the partner needs.
  output       jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Whether it passed the copy check, and what it failed on. A refused
  -- draft is kept: knowing the engine tried to say something and was
  -- stopped is more useful than a gap in the record.
  passed       boolean NOT NULL DEFAULT true,
  problems     jsonb NOT NULL DEFAULT '[]'::jsonb,
  acu_spent    integer NOT NULL DEFAULT 0 CHECK (acu_spent >= 0),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS growth_outputs_partner_idx
  ON growth_outputs (partner_id, created_at DESC);
