-- ============================================================
-- 0022 — The organisations that already gather the people.
--
-- A falls-prevention group, a social prescribing link worker, a care home
-- activities coordinator, a community pharmacist. Each of them is already
-- sitting in front of the exact person this platform is for, already
-- trusted by them, and already being asked "is there anything that would
-- help at home?". One of those relationships is worth more than a great
-- deal of search traffic, and none of them is reachable by a blog post.
--
-- What they need is not a marketing page. It is a link they can hand over
-- without worrying, and an answer to four questions: what is it, who is it
-- for, what does it cost, and what happens to what my client tells it.
--
-- ── Why there is no commission column ──
--
-- The obvious design pays a referrer per signup, and for an influencer
-- that is fine — the partner programme already does it, with disclosure.
-- For these referrers it would be wrong, and not as a matter of taste.
-- A link worker recommending a product they are paid per head for is in a
-- conflict with the person in front of them, that person has no way to
-- know, and the recommendation carries the weight of a health
-- professional's judgement. Several of these people are bound by codes
-- that would make it a disciplinary matter. So a code here attributes and
-- never pays, and the page they are given says so in those words — which
-- is also the single most persuasive line on it.
--
-- ── What is deliberately not stored ──
--
-- No contact name, no phone number, no notes about the organisation. This
-- is a lookup table for a code, not a CRM: the whole record is a code, a
-- name to recognise it by, and a kind. Attribution lands on the funnel's
-- own rows, which carry no identity and expire on their own.
-- ============================================================

CREATE TABLE IF NOT EXISTS referrers (
  -- Short, speakable and case-insensitive on the way in: this gets read
  -- aloud down a phone and written on the back of a leaflet.
  code        text PRIMARY KEY CHECK (code ~ '^[a-z0-9-]{3,24}$'),

  -- What to call it in a report. An organisation's name, not a person's.
  label       text NOT NULL CHECK (length(label) BETWEEN 2 AND 80),

  kind        text NOT NULL CHECK (
    kind IN (
      'falls_group',
      'social_prescribing',
      'care_setting',
      'pharmacy',
      'gp_practice',
      'school',
      'workplace',
      'community_group',
      'other'
    )
  ),

  -- Retired rather than deleted, so a leaflet printed two years ago still
  -- resolves to something that explains itself instead of a 404.
  active      boolean NOT NULL DEFAULT true,

  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Which code a visit or a registration came through. Nullable: most
-- traffic has no code, and that is not a gap to be filled in.
ALTER TABLE funnel_events ADD COLUMN IF NOT EXISTS referrer_code text;

CREATE INDEX IF NOT EXISTS funnel_events_by_code
  ON funnel_events (referrer_code, step)
  WHERE referrer_code IS NOT NULL;
