-- ============================================================
-- 0032 — Questions an article answers outright.
--
-- Everything downstream of a search box now extracts a passage rather
-- than ranking a page. A featured snippet, an AI overview and an
-- assistant asked a question all take the shortest self-contained answer
-- they can find, and an article with no such passage in it competes for
-- a position rather than for the answer.
--
-- These pairs become `FAQPage` structured data on the article. A question
-- phrased the way somebody types it, and an answer short enough to be
-- lifted whole rather than summarised — because a summary an engine
-- writes is not one this platform reviewed, and everything a person reads
-- here goes past a named reviewer first.
--
-- Additive with a default, so every row written before this migration is
-- valid the moment it applies: an article with no questions has an empty
-- list, which `faqJsonLd` renders as no FAQ block at all rather than as
-- an empty one. Structured data describing nothing is a markup error on a
-- live URL and a reason for a crawler to trust the rest of the page less.
-- ============================================================

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS faq jsonb NOT NULL DEFAULT '[]'::jsonb;

-- An object is not a list, and a crawler reading `{"q":...}` where an
-- array belongs gets a parse error rather than a question. Cheap to
-- enforce here, and it survives a refactor of the service that currently
-- serialises it.
ALTER TABLE posts
  DROP CONSTRAINT IF EXISTS posts_faq_is_array;
ALTER TABLE posts
  ADD CONSTRAINT posts_faq_is_array CHECK (jsonb_typeof(faq) = 'array');
