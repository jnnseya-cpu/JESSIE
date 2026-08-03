-- ============================================================
-- 0015 — What somebody lives with.
--
-- A person with exocrine pancreatic insufficiency reading "your fat is
-- high" is being told the opposite of what their clinical team told them.
-- A person with chronic kidney disease being nudged towards more protein
-- is being harmed. Until the platform knows, it reads every number the
-- same way for everybody, and for these people it reads them wrong.
--
-- This is the most sensitive row in the database, and it is treated that
-- way:
--
--   * It is only ever written because somebody chose it themselves. There
--     is no inference, no guess from a shopping basket, no "people who
--     scan this usually have that".
--   * One row per member, holding a list of catalogue identifiers and
--     nothing else. No free text, no severity, no dates, no medication,
--     no test results — none of which this platform has any business
--     holding, and all of which would turn a preference into a record.
--   * It never leaves the member. Household and organisation reporting
--     reads aggregates; this table is not in any of them, at any group
--     size, because a condition in a household of two is a name.
--   * Deleting it is one action, and deleting the account takes it.
--
-- The identifiers are validated in code against the published catalogue
-- rather than by a CHECK here, so that adding a condition is a code
-- change reviewed as one, not a migration that quietly widens what can
-- be stored.
-- ============================================================

CREATE TABLE IF NOT EXISTS member_conditions (
  user_id     text PRIMARY KEY
              REFERENCES app_users (user_id) ON DELETE CASCADE,
  -- Catalogue identifiers, e.g. ["pancreatic_insufficiency","coeliac"].
  conditions  jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- And while we are here: the ledger outliving the account.
--
-- Deleting an account removed the account and left three years of what
-- that person ate sitting in food_log, because nothing ever swept it.
-- The fix is structural rather than a line of code somebody has to
-- remember to call: the database itself now takes the diet with the
-- account, so no future deletion path can forget.
--
-- Rows belonging to no account are removed first — they are already
-- orphans, and an ALTER that finds one would fail the migration and
-- take the deployment down with it.
-- ------------------------------------------------------------

DELETE FROM food_log
 WHERE user_id NOT IN (SELECT user_id FROM app_users);

ALTER TABLE food_log
  DROP CONSTRAINT IF EXISTS food_log_user_fk;

ALTER TABLE food_log
  ADD CONSTRAINT food_log_user_fk
  FOREIGN KEY (user_id) REFERENCES app_users (user_id) ON DELETE CASCADE;
