-- Trend intelligence: observations, scored topics, one brief, guarded writes.
--
-- Nothing in here is keyed by a member, and that is a design decision
-- rather than an omission. A trend is a statement about demand, not about
-- a person, so observations arrive aggregated and the engine never needs
-- to know whose read or whose funnel step contributed. The consequence is
-- that an account deletion has nothing to cascade into these tables,
-- which is why none of them appears in migration 0035's cascade list or
-- in deletion-coverage.test.ts.
--
-- The constraints below are the promises. A service that forgets to check
-- a window, dedupe a replay or bind an approval to a payload hash will be
-- refused by the database rather than quietly doing the wrong thing, and
-- that survives a refactor of the service in a way a code comment does
-- not.

-- ------------------------------------------------------------------ --
-- Revision on a post, so a patch can compare and set
-- ------------------------------------------------------------------ --

-- Additive, with a default, so every existing row is revision 1 and
-- nothing that writes posts today needs to change. Without an integer
-- revision there is no honest compare-and-set: a timestamp can collide
-- within a clock tick, and two edits in the same second would silently
-- overwrite each other.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;

-- ------------------------------------------------------------------ --
-- Observations
-- ------------------------------------------------------------------ --

CREATE TABLE IF NOT EXISTS trend_observations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       text NOT NULL,
  source_family   text NOT NULL,
  -- Stable per source. The unique index below is what makes a replay a
  -- duplicate rather than a second data point, which is the difference
  -- between a retry and a fabricated spike.
  source_record_id text NOT NULL,
  topic_id        text NOT NULL,
  metric          text NOT NULL,
  value           double precision NOT NULL,
  unit            text NOT NULL,
  observed_at     timestamptz NOT NULL,
  window_start    timestamptz NOT NULL,
  window_end      timestamptz NOT NULL,
  ingested_at     timestamptz NOT NULL DEFAULT now(),
  -- Observed over expected, as a proxy. Stored so a report can say how
  -- much of the window it actually saw instead of implying all of it.
  coverage        double precision NOT NULL,
  evidence_hash   text,
  evidence_uri    text,

  CONSTRAINT trend_observations_family_known CHECK (
    source_family IN ('conversion', 'funnel', 'blog_engagement', 'support_topic')
  ),
  CONSTRAINT trend_observations_unit_known CHECK (unit IN ('count', 'rate', 'index')),
  -- Inclusive start, exclusive end. An empty or inverted window is not a
  -- window, and a zero-length one would make every rate infinite.
  CONSTRAINT trend_observations_window_ordered CHECK (window_start < window_end),
  CONSTRAINT trend_observations_coverage_fraction CHECK (coverage >= 0 AND coverage <= 1),
  -- A negative count is a bug upstream, not a trend.
  CONSTRAINT trend_observations_value_sane CHECK (value >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS trend_observations_source_record
  ON trend_observations (source_id, source_record_id);

CREATE INDEX IF NOT EXISTS trend_observations_topic_window
  ON trend_observations (topic_id, window_end DESC);

-- ------------------------------------------------------------------ --
-- Frozen scores
-- ------------------------------------------------------------------ --

-- A snapshot is the evidence an approval was given against. It is frozen
-- by the inputs that produced it, so rescoring the same window with the
-- same data cannot produce a second row and a later scoring version
-- supersedes rather than overwrites. An experiment whose evidence can be
-- edited after the fact is not evidence.
CREATE TABLE IF NOT EXISTS trend_opportunity_snapshots (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id         text NOT NULL,
  window_end       timestamptz NOT NULL,
  scoring_version  integer NOT NULL,
  input_digest     text NOT NULL,
  demand           double precision NOT NULL,
  fit              double precision NOT NULL,
  intent           double precision NOT NULL,
  timing           double precision NOT NULL,
  readiness        double precision NOT NULL,
  opportunity      double precision NOT NULL,
  confidence       double precision NOT NULL,
  independent_families integer NOT NULL,
  decision         text NOT NULL,
  vetoes           jsonb NOT NULL DEFAULT '[]'::jsonb,
  why              text NOT NULL,
  evidence_ids     jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),

  -- No automatic decision exists, and the database says so too. This is
  -- the clinical safety control expressed where a refactor cannot reach
  -- it: if somebody adds an acting decision to the application, the
  -- insert fails.
  CONSTRAINT trend_snapshot_decision_known CHECK (
    decision IN ('vetoed', 'archive', 'watch', 'reviewable_brief', 'priority_review')
  ),
  CONSTRAINT trend_snapshot_scores_in_range CHECK (
    opportunity >= 0 AND opportunity <= 100 AND confidence >= 0 AND confidence <= 100
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS trend_snapshot_frozen
  ON trend_opportunity_snapshots (topic_id, window_end, scoring_version, input_digest);

-- ------------------------------------------------------------------ --
-- The brief
-- ------------------------------------------------------------------ --

CREATE TABLE IF NOT EXISTS growth_briefs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id            text NOT NULL,
  brief_version       integer NOT NULL,
  snapshot_id         uuid REFERENCES trend_opportunity_snapshots (id) ON DELETE RESTRICT,
  topic_id            text NOT NULL,
  opportunity_score   double precision NOT NULL,
  confidence          double precision NOT NULL,
  valid_from          timestamptz NOT NULL,
  expires_at          timestamptz NOT NULL,
  evidence_ids        jsonb NOT NULL,
  audience            text NOT NULL,
  intent              text NOT NULL,
  approved_claim_ids  jsonb NOT NULL,
  cta_id              text NOT NULL,
  allowed_channels    jsonb NOT NULL,
  prohibited_claims   jsonb NOT NULL DEFAULT '[]'::jsonb,
  objective           text NOT NULL,
  experiment_id       text,
  policy_version      integer NOT NULL,
  status              text NOT NULL DEFAULT 'draft',
  -- A named person, not a role and not a service account. The same rule
  -- the editorial pipeline already applies to a post: an agent's opinion
  -- about health reaches nobody until somebody signs for it.
  approved_by         text,
  approved_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT growth_brief_status_known CHECK (status IN ('draft', 'approved', 'superseded')),
  CONSTRAINT growth_brief_window_ordered CHECK (valid_from < expires_at),
  -- The promise that makes the whole thing safe: approved implies a named
  -- reviewer and a time. There is no way to be approved by nobody.
  CONSTRAINT growth_brief_approved_has_reviewer CHECK (
    status <> 'approved'
    OR (approved_by IS NOT NULL AND btrim(approved_by) <> '' AND approved_at IS NOT NULL)
  ),
  CONSTRAINT growth_brief_evidence_present CHECK (jsonb_array_length(evidence_ids) > 0),
  CONSTRAINT growth_brief_claims_present CHECK (jsonb_array_length(approved_claim_ids) > 0),
  CONSTRAINT growth_brief_channels_present CHECK (jsonb_array_length(allowed_channels) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS growth_brief_revision
  ON growth_briefs (brief_id, brief_version);

-- One active brief per topic. The spec calls for a unique active scope to
-- stop two briefs fighting over the same topic and oscillating an asset
-- between two propositions; a partial unique index enforces it at write
-- time rather than hoping the service checks first.
CREATE UNIQUE INDEX IF NOT EXISTS growth_brief_one_active_per_topic
  ON growth_briefs (topic_id)
  WHERE status = 'approved';

-- ------------------------------------------------------------------ --
-- Actions, approvals and the outbox
-- ------------------------------------------------------------------ --

CREATE TABLE IF NOT EXISTS growth_actions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id          text NOT NULL,
  brief_version     integer NOT NULL,
  channel           text NOT NULL,
  action_kind       text NOT NULL,
  target_id         text NOT NULL,
  -- What the target was when the patch was written. Compare-and-set uses
  -- this, so an editor's concurrent change produces a conflict instead of
  -- being overwritten by a patch composed against the old text.
  base_revision     integer NOT NULL,
  patch             jsonb NOT NULL,
  canonical_patch_hash text NOT NULL,
  idempotency_key   text NOT NULL,
  state             text NOT NULL DEFAULT 'proposed',
  author            text NOT NULL,
  -- Saved before the adapter is called, so a rollback has something to
  -- restore even if the process dies immediately after the write.
  previous_fields   jsonb,
  applied_revision  integer,
  provider_receipt  text,
  failure_reason    text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT growth_action_kind_known CHECK (
    action_kind IN ('seo_metadata_patch', 'owned_content_patch', 'seo_page_draft', 'organic_social_draft')
  ),
  CONSTRAINT growth_action_state_known CHECK (
    state IN ('proposed', 'validated', 'pending_approval', 'approved', 'queued',
              'executing', 'applied', 'failed', 'reconciliation_required', 'rolled_back')
  ),
  -- An applied action must know what it did, or it cannot be rolled back
  -- and cannot be reconciled. "Applied, revision unknown" is the state
  -- that loses an editor's work.
  CONSTRAINT growth_action_applied_knows_revision CHECK (
    state <> 'applied' OR applied_revision IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS growth_action_idempotency
  ON growth_actions (idempotency_key);

-- At most one action in flight against a target at a time. Two concurrent
-- patches to the same post would each be composed against a revision the
-- other invalidates, so the second must wait rather than conflict.
CREATE UNIQUE INDEX IF NOT EXISTS growth_action_one_in_flight_per_target
  ON growth_actions (target_id)
  WHERE state IN ('approved', 'queued', 'executing', 'reconciliation_required');

CREATE TABLE IF NOT EXISTS growth_action_approvals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id      uuid NOT NULL REFERENCES growth_actions (id) ON DELETE CASCADE,
  -- Bound to the exact payload. Editing the patch after approval changes
  -- the hash, so the approval no longer matches and execution refuses —
  -- which is the point. An approval is for a specific sentence, not for
  -- an intention.
  payload_hash   text NOT NULL,
  target_revision integer NOT NULL,
  policy_version integer NOT NULL,
  brief_version  integer NOT NULL,
  approver       text NOT NULL,
  approved_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT growth_approval_approver_named CHECK (btrim(approver) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS growth_approval_one_per_action
  ON growth_action_approvals (action_id);

CREATE TABLE IF NOT EXISTS growth_action_outbox (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id    uuid NOT NULL REFERENCES growth_actions (id) ON DELETE CASCADE,
  -- Written in the same transaction as the state change, so there is no
  -- window in which an action is queued and nothing will ever run it, or
  -- in which something will run an action that was never queued.
  enqueued_at  timestamptz NOT NULL DEFAULT now(),
  attempts     integer NOT NULL DEFAULT 0,
  leased_until timestamptz,
  -- A fencing token, so a worker whose lease expired cannot write after a
  -- second worker has taken the job.
  lease_token  uuid,
  dead_lettered_at timestamptz,

  CONSTRAINT growth_outbox_attempts_sane CHECK (attempts >= 0 AND attempts <= 20)
);

CREATE UNIQUE INDEX IF NOT EXISTS growth_outbox_one_per_action
  ON growth_action_outbox (action_id);

-- ------------------------------------------------------------------ --
-- Measurement
-- ------------------------------------------------------------------ --

CREATE TABLE IF NOT EXISTS trend_experiments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id  text NOT NULL UNIQUE,
  brief_id       text NOT NULL,
  -- Frozen at approval, so the hypothesis cannot be rewritten to match
  -- whatever happened. This is the difference between a measurement and a
  -- story.
  hypothesis     text NOT NULL,
  primary_outcome text NOT NULL,
  baseline       jsonb NOT NULL,
  control_method text NOT NULL,
  guardrails     jsonb NOT NULL DEFAULT '[]'::jsonb,
  window_start   timestamptz NOT NULL,
  window_end     timestamptz NOT NULL,
  owner          text NOT NULL,
  verdict        text,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT trend_experiment_window_ordered CHECK (window_start < window_end),
  CONSTRAINT trend_experiment_control_known CHECK (
    control_method IN ('holdout', 'matched_untreated', 'window_comparison')
  ),
  -- `inconclusive` is a first-class verdict, not a failure to reach one.
  -- Without it, a thin result gets rounded towards whichever answer the
  -- author hoped for.
  CONSTRAINT trend_experiment_verdict_known CHECK (
    verdict IS NULL OR verdict IN ('continue', 'revise', 'stop', 'inconclusive')
  )
);

CREATE TABLE IF NOT EXISTS trend_outcomes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id text NOT NULL REFERENCES trend_experiments (experiment_id) ON DELETE CASCADE,
  variant       text NOT NULL,
  -- Aggregates only. A numerator with no denominator is a number nobody
  -- can act on, so both are required together.
  denominator   integer NOT NULL,
  conversions   integer NOT NULL,
  window_start  timestamptz NOT NULL,
  window_end    timestamptz NOT NULL,
  recorded_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT trend_outcome_counts_sane CHECK (
    denominator >= 0 AND conversions >= 0 AND conversions <= denominator
  ),
  CONSTRAINT trend_outcome_window_ordered CHECK (window_start < window_end)
);

CREATE UNIQUE INDEX IF NOT EXISTS trend_outcome_unique_window
  ON trend_outcomes (experiment_id, variant, window_start, window_end);
