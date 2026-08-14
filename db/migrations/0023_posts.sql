-- ============================================================
-- 0023 — Somewhere for an article to live.
--
-- The editorial pipeline has been complete and disconnected. The agent
-- drafts, the status machine refuses to publish without a named reviewer,
-- the SEO audit runs — and all of it happened in a `new Map()` inside one
-- process, while the public blog rendered from a TypeScript file the API
-- has never been able to write to.
--
-- So a published article did not survive a restart, was per-instance on
-- serverless, and never reached a reader under any circumstances.
-- Publishing meant a code deploy, which meant a developer, which meant it
-- never happened. That is the whole reason content has produced no
-- customers: not that the writing was wrong, but that no writing could
-- ever be read.
--
-- What this table does NOT change: publishing still requires a named
-- human reviewer, and there is still no draft-to-published transition.
-- That is a clinical safety control — an assurance claim marked enforced
-- and a control on hazard H03 — and making publishing possible is not the
-- same as making it automatic. The point is to turn a review from an
-- impossible task into a one-minute one, not to remove the reviewer.
-- ============================================================

CREATE TABLE IF NOT EXISTS posts (
  slug            text PRIMARY KEY CHECK (slug ~ '^[a-z0-9-]{3,80}$'),

  title           text NOT NULL,
  description     text NOT NULL,
  category        text NOT NULL,

  -- The phrase the article is written to answer.
  keyword         text NOT NULL DEFAULT '',
  secondary       jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Markdown-ish prose as the agent produced it, before auto-linking.
  -- Links are woven in at render rather than stored, so a page added to
  -- the registry next month appears in articles written last month
  -- without anybody editing them.
  body            text NOT NULL,

  cluster_key     text,

  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'in_review', 'published', 'archived')),

  -- Never null on a published row: enforced below, because a published
  -- article with no named reviewer is exactly the thing the whole
  -- editorial control exists to prevent, and a CHECK is a promise that
  -- survives a refactor of the service that currently makes it.
  reviewed_by     text,

  agent_drafted   boolean NOT NULL DEFAULT false,
  author          text NOT NULL DEFAULT 'JESS MOVE',

  -- The audit as it stood when the article was last saved, so a reviewer
  -- sees what the machine thought before they read it themselves.
  audit           jsonb,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  published_at    timestamptz,

  CONSTRAINT posts_published_needs_reviewer CHECK (
    status <> 'published' OR (reviewed_by IS NOT NULL AND length(reviewed_by) > 1)
  ),
  CONSTRAINT posts_published_has_date CHECK (
    status <> 'published' OR published_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS posts_published
  ON posts (published_at DESC)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS posts_queue
  ON posts (status, updated_at DESC);
