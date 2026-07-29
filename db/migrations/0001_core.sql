-- ============================================================
-- JESS MOVE — core schema (specification §20)
--
-- Every tenant-scoped table carries tenant_id and is covered by
-- row-level security. The Workforce API role is granted on
-- workforce_reports only, and explicitly NOT on sessions — §16.3
-- makes individual visibility absent rather than permission-gated.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────── enums ───────────

CREATE TYPE age_mode          AS ENUM ('explorer','teen','momentum','balance','independence','vitality');
CREATE TYPE delivery_tier     AS ENUM ('T1','T2','T3','T4');
CREATE TYPE movement_variant  AS ENUM ('standing','seated','chair_supported','bed_recliner','adaptive_single_limb');
CREATE TYPE publish_state     AS ENUM ('draft','in_review','published','retired');
CREATE TYPE snap_outcome      AS ENUM ('completed','partial','abandoned','dismissed','snoozed','expired','unsafe_stop','flagged_faked');
CREATE TYPE safety_verdict    AS ENUM ('allow','substitute','block');
CREATE TYPE tenant_type       AS ENUM ('consumer','employer','school','care','clinical','partner');
CREATE TYPE wallet_bucket     AS ENUM ('promotional','subscription','purchased');

-- ─────────── tenancy ───────────

CREATE TABLE tenants (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type              tenant_type NOT NULL,
  name              text NOT NULL,
  region            text NOT NULL DEFAULT 'UK',
  -- §16.3. The floor is 8. A tenant may raise it, never lower it.
  k_anon_threshold  integer NOT NULL DEFAULT 8 CHECK (k_anon_threshold >= 8),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

-- ─────────── identity ───────────

CREATE TABLE users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id),
  email_hash         bytea,
  email_enc          bytea,
  phone_enc          bytea,
  age_mode           age_mode NOT NULL,
  tier               delivery_tier NOT NULL DEFAULT 'T2',
  dob_verified_at    timestamptz,
  is_minor           boolean NOT NULL DEFAULT false,
  guardian_user_id   uuid REFERENCES users(id),
  locale             text NOT NULL DEFAULT 'en-GB',
  timezone           text NOT NULL DEFAULT 'Europe/London',
  nudges_enabled     boolean NOT NULL DEFAULT true,
  last_active_at     timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz,

  -- §6.1 — a child is a linked minor profile, never standalone.
  CONSTRAINT minor_requires_guardian
    CHECK (NOT is_minor OR guardian_user_id IS NOT NULL),

  -- A minor may only sit in a minor mode.
  CONSTRAINT minor_mode_consistent
    CHECK (is_minor = (age_mode IN ('explorer','teen')))
);

CREATE UNIQUE INDEX users_email_hash_key ON users (email_hash) WHERE email_hash IS NOT NULL;
CREATE INDEX users_tenant_idx    ON users (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX users_guardian_idx  ON users (guardian_user_id);

CREATE TABLE capability_profiles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  baseline_variant    movement_variant NOT NULL DEFAULT 'seated',
  adaptive_flags      text[] NOT NULL DEFAULT '{}',
  contraindications   text[] NOT NULL DEFAULT '{}',
  volatility          text NOT NULL DEFAULT 'static',
  instruction_ceiling smallint NOT NULL DEFAULT 3,
  clinician_locked    boolean NOT NULL DEFAULT false,
  confirmed_by        text NOT NULL DEFAULT 'self',
  confirmed_at        timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX capability_contraindications_idx ON capability_profiles USING gin (contraindications);

-- ─────────── library ───────────

CREATE TABLE movements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           text NOT NULL UNIQUE,
  title          text NOT NULL,
  category       text NOT NULL,
  state          publish_state NOT NULL DEFAULT 'draft',
  falls_risk     boolean NOT NULL DEFAULT false,
  anchor_required boolean NOT NULL DEFAULT false,
  min_age        smallint NOT NULL DEFAULT 10,
  physio_reviewer_id text,
  review_date    date,
  evidence_note  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  -- §11 publishing gate: a reviewer and date are required to leave draft.
  CONSTRAINT published_requires_review
    CHECK (state <> 'published' OR (physio_reviewer_id IS NOT NULL AND review_date IS NOT NULL))
);

CREATE TABLE movement_variants (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_id           uuid NOT NULL REFERENCES movements(id) ON DELETE CASCADE,
  variant               movement_variant NOT NULL,
  duration_seconds      integer NOT NULL,
  contraindication_tags text[] NOT NULL DEFAULT '{}',
  equivalence_multiplier numeric(4,2) NOT NULL DEFAULT 1.00,
  instruction_text      text NOT NULL,
  easy_read_text        text,
  audio_script          text,
  bsl_asset_id          text,
  screening_passed      boolean NOT NULL DEFAULT false,

  UNIQUE (movement_id, variant),

  -- Law 1: a Snap is 90–300 seconds. Anything else is not a Snap.
  CONSTRAINT snap_duration_bounds
    CHECK (duration_seconds BETWEEN 90 AND 300)
);

CREATE INDEX movement_variant_contra_idx ON movement_variants USING gin (contraindication_tags);

-- Cue sets: one per variant per age mode. The gate needs all five modes.
CREATE TABLE movement_cue_sets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id  uuid NOT NULL REFERENCES movement_variants(id) ON DELETE CASCADE,
  age_mode    age_mode NOT NULL,
  instructions text[] NOT NULL,
  safety_note text,
  UNIQUE (variant_id, age_mode),
  CONSTRAINT instructions_non_empty CHECK (cardinality(instructions) > 0)
);

-- ─────────── context and prescription ───────────

CREATE TABLE context_decisions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  evaluated_at      timestamptz NOT NULL DEFAULT now(),
  verdict           text NOT NULL,
  confidence        numeric(4,3) NOT NULL,
  environment_class text NOT NULL,
  privacy_class     text NOT NULL,
  blocks            text[] NOT NULL DEFAULT '{}',
  basis             text[] NOT NULL,
  ttl_seconds       integer NOT NULL DEFAULT 900,

  -- §9.2 — a decision must rest on at least one consented signal class.
  -- There is no fixed-timer fallback.
  CONSTRAINT basis_non_empty CHECK (cardinality(basis) > 0)
);

CREATE INDEX context_user_time_idx ON context_decisions (user_id, evaluated_at DESC);

CREATE TABLE prescriptions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id),
  user_id              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  movement_id          uuid NOT NULL REFERENCES movements(id),
  variant              movement_variant NOT NULL,
  -- Law 2: a Snap cannot exist without a context decision.
  context_decision_id  uuid NOT NULL REFERENCES context_decisions(id),
  age_mode             age_mode NOT NULL,
  tier                 delivery_tier NOT NULL,
  duration_target_s    integer NOT NULL CHECK (duration_target_s BETWEEN 90 AND 300),
  expected_rpe         smallint CHECK (expected_rpe BETWEEN 1 AND 10),
  scheduled_for        timestamptz NOT NULL,
  expires_at           timestamptz NOT NULL,
  delivered_at         timestamptz,
  status               text NOT NULL DEFAULT 'pending',
  rationale_token      text,
  model_version        text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX rx_user_time_idx ON prescriptions (user_id, scheduled_for DESC);
CREATE INDEX rx_expiry_idx    ON prescriptions (status, expires_at);

-- §9.2 SAFE — WORM. Never updated. This is the legal defence artefact.
CREATE TABLE safety_decisions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid NOT NULL REFERENCES prescriptions(id),
  rule_id         text NOT NULL,
  verdict         safety_verdict NOT NULL,
  reason_code     text,
  substituted_from uuid REFERENCES movements(id),
  evaluated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX safety_rx_idx ON safety_decisions (prescription_id);

CREATE TABLE sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prescription_id     uuid REFERENCES prescriptions(id),
  movement_id         uuid NOT NULL REFERENCES movements(id),
  variant             movement_variant NOT NULL,
  started_at          timestamptz NOT NULL,
  ended_at            timestamptz,
  duration_s          integer,
  rpe_reported        smallint CHECK (rpe_reported BETWEEN 1 AND 10),
  completion_pct      numeric(5,2),
  abandon_second      integer,
  outcome             snap_outcome NOT NULL,
  verification_method text,
  proxy               boolean NOT NULL DEFAULT false,
  proxy_by_user_id    uuid REFERENCES users(id),
  integrity_confidence numeric(4,3) NOT NULL DEFAULT 1.0,
  effort_score        integer,
  offline             boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT proxy_has_actor CHECK (NOT proxy OR proxy_by_user_id IS NOT NULL)
);

CREATE INDEX sessions_user_time_idx ON sessions (user_id, started_at DESC);
CREATE INDEX sessions_tenant_idx    ON sessions (tenant_id, started_at DESC);

CREATE TABLE nudges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prescription_id uuid REFERENCES prescriptions(id),
  channel         text NOT NULL,
  sent_at         timestamptz NOT NULL DEFAULT now(),
  opened_at       timestamptz,
  dismissed_at    timestamptz,
  converted       boolean NOT NULL DEFAULT false,
  -- Law 2 — a mistimed nudge is a defect against CTX, not user behaviour.
  misfire         boolean NOT NULL DEFAULT false,
  bandit_arm      jsonb
);

CREATE INDEX nudges_user_time_idx ON nudges (user_id, sent_at DESC);
CREATE INDEX nudges_misfire_idx   ON nudges (misfire, sent_at DESC) WHERE misfire;

-- ─────────── gamification ───────────

CREATE TABLE chains (
  user_id             uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_days        integer NOT NULL DEFAULT 0,
  longest_days        integer NOT NULL DEFAULT 0,
  last_active_date    date,
  grace_tokens        smallint NOT NULL DEFAULT 2 CHECK (grace_tokens BETWEEN 0 AND 2),
  flare_mode_until    date,
  hold_until          date,
  hold_kind           text,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sparks_ledger (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta         integer NOT NULL,
  reason        text NOT NULL,
  session_id    uuid REFERENCES sessions(id),
  balance_after integer NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sparks_user_time_idx ON sparks_ledger (user_id, created_at DESC);

-- ─────────── ACU wallet (§25.2, §16) ───────────

CREATE TABLE acu_wallets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type  text NOT NULL,
  subject_id    uuid NOT NULL,
  auto_topup    jsonb,
  daily_limit   integer,
  monthly_limit integer,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_type, subject_id)
);

CREATE TABLE acu_grants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id   uuid NOT NULL REFERENCES acu_wallets(id) ON DELETE CASCADE,
  bucket      wallet_bucket NOT NULL,
  amount      integer NOT NULL CHECK (amount > 0),
  remaining   integer NOT NULL CHECK (remaining >= 0),
  granted_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  source_ref  text,

  CONSTRAINT remaining_within_amount CHECK (remaining <= amount)
);

CREATE INDEX acu_grants_spend_idx ON acu_grants (wallet_id, bucket, expires_at)
  WHERE remaining > 0;

CREATE TABLE acu_transactions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id      uuid NOT NULL REFERENCES acu_wallets(id) ON DELETE CASCADE,
  delta_acu      integer NOT NULL,
  reason         text NOT NULL,
  agent_code     text,
  model          text,
  provider_cost_gbp numeric(10,6),
  customer_charge_gbp numeric(10,6),
  balance_after  integer NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),

  -- The 4x cost-protection rule, enforced in the ledger rather than
  -- only in application code. A debit must clear four times its
  -- direct provider cost.
  CONSTRAINT cost_protection_4x CHECK (
    delta_acu >= 0
    OR provider_cost_gbp IS NULL
    OR provider_cost_gbp = 0
    OR customer_charge_gbp >= provider_cost_gbp * 4
  )
);

CREATE INDEX acu_tx_wallet_time_idx ON acu_transactions (wallet_id, created_at DESC);

-- ─────────── workforce reporting ───────────

CREATE TABLE workforce_reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period            daterange NOT NULL,
  metrics           jsonb NOT NULL,
  suppressed_cells  jsonb NOT NULL DEFAULT '[]',
  contributing_users integer NOT NULL,
  generated_at      timestamptz NOT NULL DEFAULT now(),

  -- §16.3 — a report may not be persisted below the k-anonymity floor.
  CONSTRAINT k_anonymity_floor CHECK (contributing_users >= 8)
);

CREATE INDEX workforce_tenant_idx ON workforce_reports (tenant_id, generated_at DESC);

-- ─────────── governance ───────────

CREATE TABLE consents (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    text NOT NULL,
  basis      text NOT NULL,
  granted    boolean NOT NULL,
  version    text NOT NULL,
  granted_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX consents_user_idx ON consents (user_id, purpose);

CREATE TABLE audit_log (
  id         bigserial PRIMARY KEY,
  actor_id   uuid,
  actor_type text NOT NULL,
  action     text NOT NULL,
  resource   text NOT NULL,
  before     jsonb,
  after      jsonb,
  ip         inet,
  ts         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_ts_idx ON audit_log (ts DESC);

CREATE TABLE agent_actions (
  id             bigserial PRIMARY KEY,
  agent_code     text NOT NULL,
  user_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  -- §22.3 — model calls are logged with input hashes, never inputs.
  inputs_hash    bytea NOT NULL,
  output_summary text,
  model          text,
  provider       text,
  tokens_in      integer,
  tokens_out     integer,
  cost_acu       numeric(10,4),
  latency_ms     integer,
  policy_verdict text,
  trace_id       uuid,
  ts             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agent_actions_ts_idx    ON agent_actions (ts DESC);
CREATE INDEX agent_actions_agent_idx ON agent_actions (agent_code, ts DESC);

-- ─────────── row-level security ───────────

ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescriptions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_reports   ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_users ON users
  USING (tenant_id = current_setting('jessmove.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation_rx ON prescriptions
  USING (tenant_id = current_setting('jessmove.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation_sessions ON sessions
  USING (tenant_id = current_setting('jessmove.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation_reports ON workforce_reports
  USING (tenant_id = current_setting('jessmove.tenant_id', true)::uuid);

-- §16.3 — the workforce role. Granted on aggregates only.
-- The absence of a grant on `sessions` is the control: individual
-- visibility does not exist rather than being permission-gated.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jessmove_workforce') THEN
    CREATE ROLE jessmove_workforce NOLOGIN;
  END IF;
END $$;

GRANT SELECT ON workforce_reports TO jessmove_workforce;
REVOKE ALL ON sessions, prescriptions, users, nudges, sparks_ledger FROM jessmove_workforce;

COMMIT;
