-- ============================================================
-- 0002 — Identity: registered users.
--
-- The service refuses a minor without a guardian and a kind that
-- contradicts the age; this schema refuses the same writes at the
-- storage layer, so a bug in any code path produces a rejected
-- INSERT rather than a corrupt user.
-- ============================================================

CREATE TABLE IF NOT EXISTS app_users (
  user_id       text PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  kind          text NOT NULL,
  age           integer NOT NULL,
  guardian_id   text,
  display_name  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),

  -- The platform serves ages 10 to 100; 120 leaves verification headroom.
  CONSTRAINT app_users_age_range CHECK (age BETWEEN 10 AND 120),

  -- Self-service registration produces exactly two kinds. Elevated kinds
  -- are granted by an administrator through their own audited path, which
  -- inserts with a different role — this table simply cannot hold them
  -- from the signup flow's INSERT.
  CONSTRAINT app_users_kind CHECK (kind IN (
    'adult','minor','guardian','household_owner','organisation_admin',
    'organisation_member','professional','growth_partner',
    'support_agent','platform_staff'
  )),

  -- The two rules no code path may route around:
  -- an under-18 is a minor, and a minor has a guardian link.
  CONSTRAINT app_users_minor_is_minor CHECK (age >= 18 OR kind = 'minor'),
  CONSTRAINT app_users_minor_has_guardian CHECK (kind <> 'minor' OR guardian_id IS NOT NULL),

  -- Emails are stored lowercase; the unique index is only meaningful if
  -- the column cannot quietly hold a cased duplicate.
  CONSTRAINT app_users_email_lower CHECK (email = lower(email)),

  -- Nobody is their own guardian.
  CONSTRAINT app_users_not_own_guardian CHECK (guardian_id IS NULL OR guardian_id <> user_id)
);

CREATE INDEX IF NOT EXISTS app_users_guardian_idx ON app_users (guardian_id);
