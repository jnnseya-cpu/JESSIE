-- ============================================================
-- 0034 — The band a member holds, and the food they will actually eat.
--
-- Two tables for two features that were built and could not be reached
-- from the place they were asked for.
--
-- ── member_energy_band ────────────────────────────────────────────────
--
-- The day colour belongs on the food photograph: scan a meal, see whether
-- the day is still inside the range. `dayStanding` was computed only
-- inside `POST /body/energy`, on the account page, and the scan path had
-- no idea a band existed.
--
-- It could not have. The band is derived from age, pathway, consent,
-- declared conditions, BMI and seven confirmed days of ledger — none of
-- which a photograph upload carries, and all of which the client is
-- deliberately not trusted to assert. So the band becomes a stored fact
-- about the member, written when it is computed and read by anything that
-- needs it. Which it always should have been: it is reviewed every
-- fourteen days, not recomputed per request.
--
-- Only the eligible band is stored. A refusal is a property of this
-- moment — one more day of record changes it — and storing refusals would
-- invite reading a stale one as a standing verdict.
--
-- `observed_kcal_per_day` is kept beside the range because the member is
-- owed the anchor, not just the answer. A range with no visible basis is
-- a number to be argued with.
--
-- ── member_food_constraints ───────────────────────────────────────────
--
-- `SWAP_CONSTRAINTS` has listed culture, religion, allergies, budget and
-- six more on the FoodLens page since it was written, and nothing has
-- ever asked a member for any of them. `selectSwaps` honours them
-- correctly and was called from exactly one place: a policy endpoint
-- returning a worked example.
--
-- `excludes` is the row that has to be right. Allergens and religious
-- restriction are absolute at every level — a suggestion that violates
-- one is not offered more cautiously, it is not offered — so this is a
-- safety column, not a preference column.
--
-- `cuisine` is nullable and declared, never inferred. Guessing somebody's
-- cuisine from their shopping is inferring ethnicity without asking, and
-- special-category data arrived at by inference is worse than not having
-- it. Null means they have not said, and the swap ladder narrows to the
-- levels that modify a dish rather than replace it.
-- ============================================================

CREATE TABLE IF NOT EXISTS member_energy_band (
  user_id              text PRIMARY KEY,
  floor_kcal           integer NOT NULL,
  ceiling_kcal         integer NOT NULL,
  observed_kcal_per_day integer NOT NULL,
  recorded_days        integer NOT NULL,
  review_after_days    integer NOT NULL,
  computed_at          timestamptz NOT NULL DEFAULT now(),

  -- The floor is the promise. A stored row that inverted it would hand a
  -- member a ceiling below the floor and a day that can never be green.
  CONSTRAINT band_floor_below_ceiling CHECK (floor_kcal < ceiling_kcal),

  -- 1,500 is ENERGY_FLOOR_KCAL in packages/body-command. Repeated here on
  -- purpose: the service that writes this column can be rewritten, and a
  -- floor enforced only in the writer is not a floor.
  CONSTRAINT band_never_below_floor CHECK (floor_kcal >= 1500)
);

CREATE TABLE IF NOT EXISTS member_food_constraints (
  user_id    text PRIMARY KEY,
  cuisine    text,
  excludes   text[] NOT NULL DEFAULT '{}',
  declared   text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- An empty string is not a cuisine, and it would read as "declared" to
  -- every check that tests for presence — opening the levels that replace
  -- somebody's meal on the strength of a blank box.
  CONSTRAINT cuisine_not_blank CHECK (cuisine IS NULL OR length(btrim(cuisine)) > 0)
);
