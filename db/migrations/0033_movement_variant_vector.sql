-- ============================================================
-- 0033 — The Movement Vector and environments, on the variant.
--
-- `movements`, `movement_variants` and `movement_cue_sets` have existed
-- since migration 0001 and were read and written by nothing. The service
-- kept the library in `new Map()` instead, so `GET /movements` returned
-- `[]` for the whole life of the platform and an authored movement could
-- not have survived a cold start.
--
-- Wiring the service to the real tables surfaced why nobody had: the
-- TypeScript model and the SQL model describe different objects.
--
--   `MovementVariantRecord` requires `vector` — the 9-dimension Movement
--   Vector of §10.1, which is what candidate retrieval ranks on — and
--   `environments`, the places a variant is viable. Neither had a column.
--
--   `movement_variants` has `instruction_text`, `easy_read_text`,
--   `audio_script` and `bsl_asset_id`. The type had none of them.
--
-- So neither half could store what the other half required, and any
-- attempt to connect them failed at the type checker. That is the whole
-- reason this library was a Map.
--
-- Additive, and the gap closes from the SQL side because the vector is
-- the product's model rather than an implementation detail: §10.1 defines
-- it, `MovementVector` names all nine axes, and retrieval is specified
-- against it. A column is the right home for a thing the product
-- specifies.
--
-- jsonb rather than nine columns. The axes are read as one object by one
-- consumer, never filtered individually in SQL, and adding a tenth axis
-- should not be a migration against a table with content in it.
-- ============================================================

ALTER TABLE movement_variants
  ADD COLUMN IF NOT EXISTS vector jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS environments text[] NOT NULL DEFAULT '{}';

-- An object, never an array or a bare scalar. The consumer reads named
-- axes off it, so a vector stored as `[]` would read as every axis
-- absent and rank the variant against nothing.
ALTER TABLE movement_variants
  DROP CONSTRAINT IF EXISTS movement_variant_vector_is_object;
ALTER TABLE movement_variants
  ADD CONSTRAINT movement_variant_vector_is_object
  CHECK (jsonb_typeof(vector) = 'object');
