-- ============================================================
-- 0018 — A walk is movement.
--
-- The activity log recognised five things, and none of them was a walk.
-- Somebody who walked forty minutes to work and back had done more
-- movement that day than most Snap-only days contain, and the platform
-- recorded nothing: no streak, no days-moved, no minutes. The one form of
-- movement almost everybody already does was the one form it could not
-- see.
--
-- `walk_logged` is added as its own kind rather than recorded as a
-- completed Snap, and the distinction is not cosmetic. Completion rate is
-- completed ÷ offered, and it answers one question: was the engine's
-- timing right? A walk nobody offered says nothing about that. Folded in
-- as a snap_completed it would inflate the numerator against a denominator
-- it never entered, and the platform would quietly start reporting that it
-- was getting better at choosing moments when all that had happened is
-- that somebody walked to the shops.
--
-- What a walk carries is minutes and nothing else. No distance, no pace,
-- no calories, no step count. Every one of those would have to be inferred
-- from a duration somebody typed, and this platform's whole position on
-- numbers is that it does not invent them. Minutes are what was reported,
-- so minutes are what is stored.
--
-- The 7200-second ceiling is unchanged and applies here too: a two-hour
-- cap on any single entry. A longer walk is two entries, which is a small
-- friction in exchange for a bound on what a single POST can claim.
-- ============================================================

ALTER TABLE member_activity
  DROP CONSTRAINT IF EXISTS member_activity_kind_check;

ALTER TABLE member_activity
  ADD CONSTRAINT member_activity_kind_check
  CHECK (
    kind IN (
      'snap_offered',
      'snap_completed',
      'snap_held',
      'food_checked',
      'body_read',
      -- Movement the member did on their own and told us about. Minutes
      -- only; the category is always cardio.
      'walk_logged'
    )
  );
