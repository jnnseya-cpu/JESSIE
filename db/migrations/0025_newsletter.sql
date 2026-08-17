-- ============================================================
-- 0025 — The weekly newsletter: consent, issues, and one send each.
--
-- Three things have to be true at the storage layer before a platform
-- may email its whole user list every week, because each of them is a
-- promise no service method should be trusted to keep on its own.
--
-- FIRST, CONSENT IS A COLUMN, NOT AN ASSUMPTION.
--
-- Registering for a movement platform is not asking to be marketed to.
-- Under UK PECR an unsolicited marketing email needs consent or a narrow
-- soft opt-in, and the burden of showing it sits with the sender — which
-- means the only defensible default is false. Every existing row
-- therefore starts opted out, and the audience grows only as people
-- actually choose it. A newsletter sent to a list nobody joined is not a
-- growth channel, it is a regulatory liability and a spam-folder
-- reputation that takes months to undo.
--
-- `marketing_consent_at` records when. Consent with no date is an
-- assertion; consent with a date is evidence.
--
-- SECOND, UNSUBSCRIBING CANNOT REQUIRE A PASSWORD.
--
-- A one-click unsubscribe has to work from an email client, on a phone,
-- for somebody who has forgotten they ever signed up and will report the
-- message as spam if the link asks them to log in. So each user carries
-- an opaque random token, and the public unsubscribe route trades that
-- token for an opt-out and nothing else. The token identifies a
-- subscription, never a session: it grants no read access, no profile,
-- no login. It is deliberately not the user_id, because a guessable
-- unsubscribe link lets anybody opt out somebody else.
--
-- THIRD, A REPEATED SEND MUST NOT MEAN A REPEATED EMAIL.
--
-- The same rule the wallet lives by, applied to the inbox. A scheduler
-- that retries, a cron that fires twice, an operator who presses the
-- button again after a timeout — all three are ordinary, and all three
-- must be survivable. `newsletter_sends` carries UNIQUE (issue_id,
-- user_id), so the second attempt loses to a constraint rather than
-- arriving in somebody's inbox. Idempotency lives here and not in a
-- service, because a service can be refactored and a constraint cannot
-- be refactored by accident.
--
-- And the editorial control is the same one the blog has, for the same
-- reason: this copy describes a health product, so no issue reaches a
-- single inbox without a named human having read it. The CHECK below is
-- what makes that structural instead of procedural — there is no status
-- past review that a row can hold while `reviewed_by` is empty.
-- ============================================================

/* ---------------------------------------------------------------- *
 * Consent, on the identity table where the email already lives.
 * ---------------------------------------------------------------- */

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS marketing_email_consent boolean NOT NULL DEFAULT false;

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS marketing_consent_at timestamptz;

-- Opaque, unique, and generated for every row — existing and future.
--
-- The DEFAULT is the part that matters and it was missing at first. A
-- backfill alone fixes the rows that exist today and quietly fails every
-- account created afterwards: registration does not mention this column,
-- so a new member's token is null, and a null token means the send path
-- has no unsubscribe link to put in the footer. That is a marketing email
-- with no opt-out — the precise failure this table exists to prevent, and
-- it would have appeared weeks later, only for people who joined recently.
--
-- A DEFAULT plus NOT NULL makes it impossible instead of unlikely: no
-- INSERT anywhere in the application can produce a member who cannot
-- unsubscribe, whether or not its author knew this column existed.
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS unsubscribe_token text;

ALTER TABLE app_users
  ALTER COLUMN unsubscribe_token SET DEFAULT encode(gen_random_bytes(16), 'hex');

UPDATE app_users
   SET unsubscribe_token = encode(gen_random_bytes(16), 'hex')
 WHERE unsubscribe_token IS NULL;

ALTER TABLE app_users
  ALTER COLUMN unsubscribe_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS app_users_unsubscribe_token
  ON app_users (unsubscribe_token);

-- Consent that is on must have a date. A true with no timestamp is
-- exactly the state that cannot be defended to a regulator later.
ALTER TABLE app_users
  DROP CONSTRAINT IF EXISTS app_users_consent_dated;
ALTER TABLE app_users
  ADD CONSTRAINT app_users_consent_dated CHECK (
    marketing_email_consent = false OR marketing_consent_at IS NOT NULL
  );

/* ---------------------------------------------------------------- *
 * The issues.
 * ---------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS newsletter_issues (
  id            bigserial   PRIMARY KEY,

  -- One issue per ISO week, e.g. 2026-W34. Unique, so a cron that fires
  -- twice in a week composes nothing the second time: the insert loses.
  issue_key     text        NOT NULL UNIQUE
                            CHECK (issue_key ~ '^[0-9]{4}-W[0-9]{2}$'),

  subject       text        NOT NULL CHECK (length(subject) BETWEEN 8 AND 160),

  -- The line an inbox shows next to the subject. Empty is allowed; the
  -- composer always writes one, but an operator editing by hand should
  -- not be blocked by it.
  preheader     text        NOT NULL DEFAULT '',

  -- Markdown-ish prose with [label](/path) links, exactly as the blog
  -- stores it. Links are resolved against the live registry at render, so
  -- an issue written this week still points somewhere real next year.
  body          text        NOT NULL,

  -- How many of those links the composer produced. Recorded rather than
  -- recomputed so a reviewer sees what they are approving.
  link_count    integer     NOT NULL DEFAULT 0,

  status        text        NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft','in_review','approved','sent','archived')),

  -- Never null once an issue is approved or sent. This is the clinical
  -- editorial control, expressed as a constraint: there is no path to an
  -- inbox that does not pass through a person willing to put their name
  -- on the copy.
  reviewed_by   text,

  created_at    timestamptz NOT NULL DEFAULT now(),
  approved_at   timestamptz,
  sent_at       timestamptz,

  CONSTRAINT newsletter_needs_reviewer CHECK (
    status NOT IN ('approved','sent')
    OR (reviewed_by IS NOT NULL AND length(reviewed_by) > 1)
  ),
  CONSTRAINT newsletter_sent_has_date CHECK (
    status <> 'sent' OR sent_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS newsletter_issues_recent
  ON newsletter_issues (created_at DESC);

/* ---------------------------------------------------------------- *
 * One row per person per issue. The idempotency lives here.
 * ---------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS newsletter_sends (
  id         bigserial   PRIMARY KEY,

  issue_id   bigint      NOT NULL REFERENCES newsletter_issues (id) ON DELETE CASCADE,
  user_id    text        NOT NULL,

  -- 'sent' and 'sandbox' both mean the send was attempted and must not be
  -- attempted again; 'failed' is recorded for the same reason, because a
  -- retry loop that re-sends every failure will eventually re-send a
  -- message that actually arrived. Re-sending is an operator decision,
  -- not something a scheduler does on its own.
  status     text        NOT NULL CHECK (status IN ('sent','sandbox','failed','skipped')),

  -- Why a person was skipped: not consented, under 18, no address. Kept
  -- so "why did only nine of four hundred get it" has an answer.
  detail     text        NOT NULL DEFAULT '',

  at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT newsletter_sends_once UNIQUE (issue_id, user_id)
);

CREATE INDEX IF NOT EXISTS newsletter_sends_issue
  ON newsletter_sends (issue_id, status);
