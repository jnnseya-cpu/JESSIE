-- A number attached to an act.
--
-- Some acts carry a measurement the member gave us — a weight for a body
-- read, an energy estimate for a meal. Storing it here is what lets the
-- trajectory and the meal-against-your-own-fortnight charts exist at all,
-- and keeps them derived from the member's own history rather than a
-- population average.
ALTER TABLE member_activity ADD COLUMN IF NOT EXISTS value numeric;
