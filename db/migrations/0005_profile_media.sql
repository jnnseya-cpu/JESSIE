-- ============================================================
-- 0005 — Durable profile media references.
--
-- The pixels live in object storage (Vercel Blob); these columns are
-- the account's pointers to them, so an avatar survives instance
-- recycling like everything else identity-shaped. Under 18 the
-- service refuses photographic media entirely, so for a minor these
-- stay NULL — there is no consent switch that changes that.
-- ============================================================

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS cover_url text;
