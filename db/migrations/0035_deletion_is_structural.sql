-- ============================================================
-- 0035 — Deleting an account takes the member's data with it.
--
-- /assurance has told the public this since it was written:
--
--   "Deleting an account deletes everything derived from it. Foreign
--    keys with ON DELETE CASCADE from app_users cover conditions, the
--    food ledger, growth results and strength checks, so deletion is a
--    database guarantee rather than a callback somebody has to
--    remember."  — ENFORCED BY A TEST
--
-- The first sentence was false, the second was true of exactly the four
-- tables it names, and the test did not test it. `deleteAccount` does
-- three things: drops an in-memory profile, deletes push rows, and
-- deletes from app_users — which cascades to five tables. Sixteen other
-- tables held the member by `user_id` with no foreign key at all.
--
-- Measured, not assumed. A member was registered through the real API,
-- rows were written as the services write them, `POST /auth/me/delete`
-- returned {"deleted":true}, and the member was still present in all
-- seven tables that had been written — including `member_energy_band`
-- (a kcal floor and ceiling derived from their weight and BMI),
-- `member_food_constraints` (a declared cuisine, which can reveal
-- religion and is special-category data under UK GDPR Article 9) and
-- `member_activity` (what they did and when).
--
-- This platform onboards children from the age of ten. A confirmed
-- erasure request that leaves a child's health data in the database is
-- not a defect to schedule; it is the reason this migration is not
-- waiting for anything else.
--
-- ── Why a foreign key and not more code ─────────────────────────────
--
-- Migration 0015 already wrote the reasoning, for the food ledger:
--
--   "The fix is structural rather than a line of code somebody has to
--    remember to call: the database itself now takes the diet with the
--    account, so no future deletion path can forget."
--
-- That was right, and it was applied to five tables and then stopped.
-- Code-level deletion has already been shown to fail here precisely
-- because it is a list somebody maintains: the services write to
-- sixteen member-keyed tables and `deleteAccount` names two of them. A
-- constraint cannot be forgotten by a new feature.
--
-- ── What is NOT in this list, and why ───────────────────────────────
--
-- `app_wallets` is polymorphic: `subject_type` is one of user, family or
-- organisation, so `subject_id` is not always a member id and cannot
-- carry a foreign key to app_users.
--
-- `app_wallets`, `annual_deposits`, `stripe_customers` and
-- `stripe_subscriptions` are accounting records. UK company and tax law
-- requires transaction records to be kept for years after the
-- relationship ends, and UK GDPR Article 17(3)(b) permits exactly that
-- retention where it is needed to meet a legal obligation. Cascading
-- them would destroy the audit trail for money that actually moved.
--
-- So they are retained deliberately, and the public page now says so
-- rather than claiming a deletion that does not happen. An exception
-- stated is a policy; an exception unstated is a false promise.
--
-- Orphans are removed before each constraint is added. An ALTER that
-- finds one fails the migration and takes the deployment with it — and
-- a row belonging to no account is already something that should not
-- exist.
-- ============================================================

-- ------------------------------------------------------------
-- The body: what the member's own body and behaviour produced.
-- ------------------------------------------------------------

DELETE FROM member_energy_band
 WHERE user_id NOT IN (SELECT user_id FROM app_users);
ALTER TABLE member_energy_band
  DROP CONSTRAINT IF EXISTS member_energy_band_user_fk;
ALTER TABLE member_energy_band
  ADD CONSTRAINT member_energy_band_user_fk
  FOREIGN KEY (user_id) REFERENCES app_users (user_id) ON DELETE CASCADE;

DELETE FROM member_food_constraints
 WHERE user_id NOT IN (SELECT user_id FROM app_users);
ALTER TABLE member_food_constraints
  DROP CONSTRAINT IF EXISTS member_food_constraints_user_fk;
ALTER TABLE member_food_constraints
  ADD CONSTRAINT member_food_constraints_user_fk
  FOREIGN KEY (user_id) REFERENCES app_users (user_id) ON DELETE CASCADE;

DELETE FROM member_activity
 WHERE user_id NOT IN (SELECT user_id FROM app_users);
ALTER TABLE member_activity
  DROP CONSTRAINT IF EXISTS member_activity_user_fk;
ALTER TABLE member_activity
  ADD CONSTRAINT member_activity_user_fk
  FOREIGN KEY (user_id) REFERENCES app_users (user_id) ON DELETE CASCADE;

-- ------------------------------------------------------------
-- The day: when they are reachable, and what the platform decided.
-- ------------------------------------------------------------

DELETE FROM member_windows
 WHERE user_id NOT IN (SELECT user_id FROM app_users);
ALTER TABLE member_windows
  DROP CONSTRAINT IF EXISTS member_windows_user_fk;
ALTER TABLE member_windows
  ADD CONSTRAINT member_windows_user_fk
  FOREIGN KEY (user_id) REFERENCES app_users (user_id) ON DELETE CASCADE;

DELETE FROM member_state
 WHERE user_id NOT IN (SELECT user_id FROM app_users);
ALTER TABLE member_state
  DROP CONSTRAINT IF EXISTS member_state_user_fk;
ALTER TABLE member_state
  ADD CONSTRAINT member_state_user_fk
  FOREIGN KEY (user_id) REFERENCES app_users (user_id) ON DELETE CASCADE;

DELETE FROM nudge_runs
 WHERE user_id NOT IN (SELECT user_id FROM app_users);
ALTER TABLE nudge_runs
  DROP CONSTRAINT IF EXISTS nudge_runs_user_fk;
ALTER TABLE nudge_runs
  ADD CONSTRAINT nudge_runs_user_fk
  FOREIGN KEY (user_id) REFERENCES app_users (user_id) ON DELETE CASCADE;

-- ------------------------------------------------------------
-- The ways the platform can reach them.
--
-- `deleteAccount` already removes both of these explicitly, and that is
-- why they were the two it remembered. The constraint is here so that
-- remembering stops being load-bearing.
-- ------------------------------------------------------------

DELETE FROM push_subscriptions
 WHERE user_id IS NOT NULL
   AND user_id NOT IN (SELECT user_id FROM app_users);
ALTER TABLE push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_user_fk;
-- Nullable on purpose: a visitor who has not signed in may subscribe,
-- and that row is owned by nobody rather than by a guess.
ALTER TABLE push_subscriptions
  ADD CONSTRAINT push_subscriptions_user_fk
  FOREIGN KEY (user_id) REFERENCES app_users (user_id) ON DELETE CASCADE;

DELETE FROM device_push_tokens
 WHERE user_id NOT IN (SELECT user_id FROM app_users);
ALTER TABLE device_push_tokens
  DROP CONSTRAINT IF EXISTS device_push_tokens_user_fk;
ALTER TABLE device_push_tokens
  ADD CONSTRAINT device_push_tokens_user_fk
  FOREIGN KEY (user_id) REFERENCES app_users (user_id) ON DELETE CASCADE;

DELETE FROM newsletter_sends
 WHERE user_id NOT IN (SELECT user_id FROM app_users);
ALTER TABLE newsletter_sends
  DROP CONSTRAINT IF EXISTS newsletter_sends_user_fk;
ALTER TABLE newsletter_sends
  ADD CONSTRAINT newsletter_sends_user_fk
  FOREIGN KEY (user_id) REFERENCES app_users (user_id) ON DELETE CASCADE;

-- ------------------------------------------------------------
-- Who they did it with.
--
-- A challenge or crew keeps its own row; what goes is this member's
-- membership and their contribution to it. A team's score recomputes
-- from the members who remain, which is the correct behaviour — the
-- alternative is a leaderboard carrying somebody who asked to be gone.
-- ------------------------------------------------------------

DELETE FROM challenge_members
 WHERE user_id NOT IN (SELECT user_id FROM app_users);
ALTER TABLE challenge_members
  DROP CONSTRAINT IF EXISTS challenge_members_user_fk;
ALTER TABLE challenge_members
  ADD CONSTRAINT challenge_members_user_fk
  FOREIGN KEY (user_id) REFERENCES app_users (user_id) ON DELETE CASCADE;

DELETE FROM challenge_activity
 WHERE user_id NOT IN (SELECT user_id FROM app_users);
ALTER TABLE challenge_activity
  DROP CONSTRAINT IF EXISTS challenge_activity_user_fk;
ALTER TABLE challenge_activity
  ADD CONSTRAINT challenge_activity_user_fk
  FOREIGN KEY (user_id) REFERENCES app_users (user_id) ON DELETE CASCADE;

DELETE FROM group_members
 WHERE user_id NOT IN (SELECT user_id FROM app_users);
ALTER TABLE group_members
  DROP CONSTRAINT IF EXISTS group_members_user_fk;
ALTER TABLE group_members
  ADD CONSTRAINT group_members_user_fk
  FOREIGN KEY (user_id) REFERENCES app_users (user_id) ON DELETE CASCADE;
