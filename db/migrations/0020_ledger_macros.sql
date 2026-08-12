-- ============================================================
-- 0020 — Protein, carbohydrate and fibre in the ledger.
--
-- FoodLens already estimates all three for every plate it reads. It shows
-- them as a percentage split on the meal — "32% protein" — and then throws
-- the grams away, because this table only ever had the UK front-of-pack
-- set: energy, fat, saturates, sugars, salt.
--
-- Which means the platform has been telling somebody on appetite-
-- suppressing medication to put protein first in every meal, and has had
-- no way to tell them whether they did. Same for the strength and balance
-- programme: the muscle-preserving pair is resistance work and enough
-- protein, and only one half of that was measurable. A percentage of one
-- plate does not answer "am I getting enough" — only a total across days
-- does, and the total was never kept.
--
-- Fibre comes along because barcode lookups already return it, it is the
-- single most under-eaten nutrient in the UK diet, and several declared
-- conditions turn on it in both directions.
--
-- Nullable, and that is the important part. A barcode without a protein
-- figure and a photograph the model would not estimate both write NULL,
-- never 0. The rollup counts how many entries actually carried a value and
-- says so, because summing what is present and dividing by the whole
-- window reports somebody eating far less protein than they are — and the
-- action that follows from an understated protein figure is "eat more
-- protein", which is the wrong thing to tell somebody with reduced kidney
-- function. A missing number has to stay missing all the way to the page.
-- ============================================================

ALTER TABLE food_log ADD COLUMN IF NOT EXISTS protein_g      numeric;
ALTER TABLE food_log ADD COLUMN IF NOT EXISTS carbohydrate_g numeric;
ALTER TABLE food_log ADD COLUMN IF NOT EXISTS fibre_g        numeric;

-- Negative grams are a bug upstream, not data. No upper bound: a bulk
-- shop scanned in one trip legitimately carries very large totals, and a
-- ceiling here would reject the basket rather than the mistake.
ALTER TABLE food_log DROP CONSTRAINT IF EXISTS food_log_macros_non_negative;
ALTER TABLE food_log
  ADD CONSTRAINT food_log_macros_non_negative
  CHECK (
    (protein_g      IS NULL OR protein_g      >= 0) AND
    (carbohydrate_g IS NULL OR carbohydrate_g >= 0) AND
    (fibre_g        IS NULL OR fibre_g        >= 0)
  );
