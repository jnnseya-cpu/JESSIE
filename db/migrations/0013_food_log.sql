-- ============================================================
-- 0013 — The food ledger.
--
-- Every scan and every analysed photograph, kept, so that FoodLens stops
-- being a thing you use once and starts being a record of what a person
-- actually eats. Totals across a week, a month or a year are the whole
-- point: one meal tells you nothing, three hundred tell you where the
-- salt is coming from.
--
-- Three years, then it goes. Long enough to see a year-on-year change,
-- short enough that nobody is holding a decade of somebody's diet. A
-- member can clear the lot at any time, and deleting the account takes it
-- with them.
--
-- Nothing clinical is stored here — this is what a label said and what a
-- photograph suggested, nothing more.
-- ============================================================

CREATE TABLE IF NOT EXISTS food_log (
  id            text PRIMARY KEY,
  user_id       text NOT NULL,
  at            timestamptz NOT NULL DEFAULT now(),
  kind          text NOT NULL CHECK (kind IN ('barcode', 'photo', 'declared', 'basket')),
  name          text NOT NULL,
  barcode       text,
  grams         numeric,
  kcal          numeric,
  fat_g         numeric,
  saturates_g   numeric,
  sugars_g      numeric,
  salt_g        numeric,
  -- Where the figures came from: a label outranks a photograph, and the
  -- summary says so rather than averaging the two as if they were equal.
  basis         text NOT NULL DEFAULT 'estimate'
                CHECK (basis IN ('label', 'calculated', 'estimate')),
  detail        jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS food_log_user_at_idx ON food_log (user_id, at DESC);
