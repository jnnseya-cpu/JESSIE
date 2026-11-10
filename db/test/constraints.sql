-- ============================================================
-- Schema invariant tests.
--
-- Each block asserts that the database REJECTS a write that would
-- violate a rule from the specification. A constraint that does not
-- fire here is not enforcement — it is documentation.
--
-- Run:  psql -d jessmove -v ON_ERROR_STOP=1 -f db/test/constraints.sql
-- ============================================================

\set QUIET on
\pset tuples_only on

CREATE OR REPLACE FUNCTION pg_temp.must_reject(stmt text, label text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN others THEN
    RETURN 'ok   — ' || label;
  END;
  RAISE EXCEPTION 'NOT REJECTED — %', label;
END $$;

BEGIN;

INSERT INTO tenants (id, type, name)
VALUES ('11111111-1111-1111-1111-111111111111', 'employer', 'Test Co');

INSERT INTO users (id, tenant_id, age_mode, is_minor)
VALUES ('22222222-2222-2222-2222-222222222222',
        '11111111-1111-1111-1111-111111111111', 'momentum', false);

INSERT INTO movements (id, slug, title, category, state)
VALUES ('33333333-3333-3333-3333-333333333333', 'test-mv', 'Test', 'mobility', 'draft');

-- ── §6.1 a minor may not exist without a guardian ──
SELECT pg_temp.must_reject($$
  INSERT INTO users (tenant_id, age_mode, is_minor)
  VALUES ('11111111-1111-1111-1111-111111111111', 'explorer', true)
$$, 'a minor cannot be created without a guardian');

-- ── a minor may not sit in an adult mode ──
SELECT pg_temp.must_reject($$
  INSERT INTO users (tenant_id, age_mode, is_minor, guardian_user_id)
  VALUES ('11111111-1111-1111-1111-111111111111', 'momentum', true,
          '22222222-2222-2222-2222-222222222222')
$$, 'a minor cannot be placed in an adult mode');

-- ── Law 1: a Snap is 90–300 seconds ──
SELECT pg_temp.must_reject($$
  INSERT INTO movement_variants (movement_id, variant, duration_seconds, instruction_text)
  VALUES ('33333333-3333-3333-3333-333333333333', 'seated', 45, 'too short')
$$, 'a 45-second variant is not a Snap');

SELECT pg_temp.must_reject($$
  INSERT INTO movement_variants (movement_id, variant, duration_seconds, instruction_text)
  VALUES ('33333333-3333-3333-3333-333333333333', 'standing', 600, 'too long')
$$, 'a 600-second variant is not a Snap');

-- ── §11: a movement cannot be published without a named reviewer ──
SELECT pg_temp.must_reject($$
  INSERT INTO movements (slug, title, category, state)
  VALUES ('unreviewed', 'Unreviewed', 'balance', 'published')
$$, 'publishing without a physio reviewer is rejected');

-- ── §9.2: a context decision must rest on a real signal ──
SELECT pg_temp.must_reject($$
  INSERT INTO context_decisions
    (user_id, verdict, confidence, environment_class, privacy_class, basis)
  VALUES ('22222222-2222-2222-2222-222222222222', 'movable', 0.9, 'desk', 'alone', '{}')
$$, 'a context decision with no basis is rejected');

-- ── Law 2: a prescription requires a context decision (NOT NULL FK) ──
SELECT pg_temp.must_reject($$
  INSERT INTO prescriptions
    (tenant_id, user_id, movement_id, variant, age_mode, tier,
     duration_target_s, scheduled_for, expires_at)
  VALUES ('11111111-1111-1111-1111-111111111111',
          '22222222-2222-2222-2222-222222222222',
          '33333333-3333-3333-3333-333333333333',
          'seated', 'momentum', 'T2', 150, now(), now() + interval '20 min')
$$, 'a Snap cannot be prescribed without a context decision');

-- ── §16.3: a cohort report below k=8 cannot be persisted ──
SELECT pg_temp.must_reject($$
  INSERT INTO workforce_reports (tenant_id, period, metrics, contributing_users)
  VALUES ('11111111-1111-1111-1111-111111111111',
          daterange('2026-01-01','2026-02-01'), '{}'::jsonb, 7)
$$, 'a report with 7 contributing users is rejected');

-- ── §16.3: the k-anonymity floor cannot be lowered by a tenant ──
SELECT pg_temp.must_reject($$
  INSERT INTO tenants (type, name, k_anon_threshold)
  VALUES ('employer', 'Lower The Floor Ltd', 4)
$$, 'a tenant cannot set a k-anonymity threshold below 8');

-- ── the 4x cost-protection rule, enforced in the ledger ──
INSERT INTO acu_wallets (id, subject_type, subject_id)
VALUES ('44444444-4444-4444-4444-444444444444', 'user',
        '22222222-2222-2222-2222-222222222222');

SELECT pg_temp.must_reject($$
  INSERT INTO acu_transactions
    (wallet_id, delta_acu, reason, provider_cost_gbp, customer_charge_gbp, balance_after)
  VALUES ('44444444-4444-4444-4444-444444444444', -20, 'meal_analysis', 0.15, 0.30, 100)
$$, 'a debit charging only 2x provider cost is rejected');

-- ── grace tokens cannot exceed the monthly allowance ──
SELECT pg_temp.must_reject($$
  INSERT INTO chains (user_id, grace_tokens)
  VALUES ('22222222-2222-2222-2222-222222222222', 5)
$$, 'more than 2 grace tokens per month is rejected');

-- ── a proxy session must name the person acting ──
SELECT pg_temp.must_reject($$
  INSERT INTO sessions
    (tenant_id, user_id, movement_id, variant, started_at, outcome, proxy)
  VALUES ('11111111-1111-1111-1111-111111111111',
          '22222222-2222-2222-2222-222222222222',
          '33333333-3333-3333-3333-333333333333',
          'seated', now(), 'completed', true)
$$, 'a proxy session must record who acted');

-- ── an ACU grant cannot have more remaining than was granted ──
SELECT pg_temp.must_reject($$
  INSERT INTO acu_grants (wallet_id, bucket, amount, remaining, expires_at)
  VALUES ('44444444-4444-4444-4444-444444444444', 'subscription', 200, 500,
          now() + interval '90 days')
$$, 'a grant cannot have more remaining than granted');

-- ── the happy path still works ──
INSERT INTO movement_variants (movement_id, variant, duration_seconds, instruction_text)
VALUES ('33333333-3333-3333-3333-333333333333', 'seated', 150, 'Sit tall, open the chest.');

INSERT INTO context_decisions
  (id, user_id, verdict, confidence, environment_class, privacy_class, basis)
VALUES ('55555555-5555-5555-5555-555555555555',
        '22222222-2222-2222-2222-222222222222', 'movable', 0.86, 'desk', 'semi_public',
        ARRAY['calendar','motion']);

INSERT INTO prescriptions
  (tenant_id, user_id, movement_id, variant, context_decision_id, age_mode, tier,
   duration_target_s, scheduled_for, expires_at)
VALUES ('11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333',
        'seated', '55555555-5555-5555-5555-555555555555', 'momentum', 'T2',
        150, now(), now() + interval '25 min');

INSERT INTO workforce_reports (tenant_id, period, metrics, contributing_users)
VALUES ('11111111-1111-1111-1111-111111111111',
        daterange('2026-01-01','2026-02-01'), '{"participation":0.41}'::jsonb, 12);

SELECT 'ok   — a valid Snap, context decision and k=12 report all insert';


-- ------------------------------------------------------------
-- 0002 — identity
-- ------------------------------------------------------------

SELECT pg_temp.must_reject(
  $q$ INSERT INTO app_users (user_id,email,password_hash,kind,age,guardian_id,display_name)
      VALUES ('t_1','kid@example.com','x','adult',15,NULL,'Kid') $q$,
  'an under-18 cannot hold an adult account');

SELECT pg_temp.must_reject(
  $q$ INSERT INTO app_users (user_id,email,password_hash,kind,age,guardian_id,display_name)
      VALUES ('t_2','kid2@example.com','x','minor',15,NULL,'Kid') $q$,
  'a minor without a guardian link is rejected');

SELECT pg_temp.must_reject(
  $q$ INSERT INTO app_users (user_id,email,password_hash,kind,age,guardian_id,display_name)
      VALUES ('t_3','MiXeD@Example.com','x','adult',30,NULL,'Cased') $q$,
  'a non-lowercase email is rejected');

SELECT pg_temp.must_reject(
  $q$ INSERT INTO app_users (user_id,email,password_hash,kind,age,guardian_id,display_name)
      VALUES ('t_4','self@example.com','x','minor',15,'t_4','Self') $q$,
  'nobody is their own guardian');

SELECT pg_temp.must_reject(
  $q$ INSERT INTO app_users (user_id,email,password_hash,kind,age,guardian_id,display_name)
      VALUES ('t_5','young@example.com','x','minor',8,'g_1','Too young') $q$,
  'an age below 10 is rejected');

INSERT INTO app_users (user_id,email,password_hash,kind,age,guardian_id,display_name)
VALUES ('t_ok_g','guardian@example.com','x','guardian',44,NULL,'A Guardian');
INSERT INTO app_users (user_id,email,password_hash,kind,age,guardian_id,display_name)
VALUES ('t_ok_m','teen@example.com','x','minor',15,'t_ok_g','A Teen');

SELECT pg_temp.must_reject(
  $q$ INSERT INTO app_users (user_id,email,password_hash,kind,age,guardian_id,display_name)
      VALUES ('t_6','TEEN@example.com','x','adult',30,NULL,'Duplicate') $q$,
  'a duplicate email is rejected regardless of case');

SELECT 'ok   — a guardian and a linked minor both insert';

-- ------------------------------------------------------------
-- Trend intelligence (0036)
--
-- The promises that must outlive a refactor of the service making
-- them. Each one is the database refusing something the application
-- also refuses, so a bug in one layer is caught by the other.
-- ------------------------------------------------------------

SELECT pg_temp.must_reject(
  $q$ INSERT INTO trend_observations
        (source_id,source_family,source_record_id,topic_id,metric,value,unit,
         observed_at,window_start,window_end,coverage)
      VALUES ('s1','crystal_ball','r1','t','count',5,'count',
              now(),now() - interval '1 day',now(),1) $q$,
  'an unregistered source family is rejected');

SELECT pg_temp.must_reject(
  $q$ INSERT INTO trend_observations
        (source_id,source_family,source_record_id,topic_id,metric,value,unit,
         observed_at,window_start,window_end,coverage)
      VALUES ('s1','funnel','r2','t','count',5,'count',
              now(),now(),now(),1) $q$,
  'a zero-length observation window is rejected');

SELECT pg_temp.must_reject(
  $q$ INSERT INTO trend_observations
        (source_id,source_family,source_record_id,topic_id,metric,value,unit,
         observed_at,window_start,window_end,coverage)
      VALUES ('s1','funnel','r3','t','count',-1,'count',
              now(),now() - interval '1 day',now(),1) $q$,
  'a negative observation value is rejected');

SELECT pg_temp.must_reject(
  $q$ INSERT INTO trend_observations
        (source_id,source_family,source_record_id,topic_id,metric,value,unit,
         observed_at,window_start,window_end,coverage)
      VALUES ('s1','funnel','r4','t','count',5,'count',
              now(),now() - interval '1 day',now(),1.5) $q$,
  'coverage above 1 is rejected — it is a fraction, not a percentage');

INSERT INTO trend_observations
  (source_id,source_family,source_record_id,topic_id,metric,value,unit,
   observed_at,window_start,window_end,coverage)
VALUES ('s1','funnel','r_ok','t','count',25,'count',
        now(),now() - interval '1 day',now(),0.9);

SELECT pg_temp.must_reject(
  $q$ INSERT INTO trend_observations
        (source_id,source_family,source_record_id,topic_id,metric,value,unit,
         observed_at,window_start,window_end,coverage)
      VALUES ('s1','funnel','r_ok','t','count',999,'count',
              now(),now() - interval '1 day',now(),0.9) $q$,
  'a replayed source record cannot become a second observation');

SELECT pg_temp.must_reject(
  $q$ INSERT INTO trend_opportunity_snapshots
        (topic_id,window_end,scoring_version,input_digest,demand,fit,intent,
         timing,readiness,opportunity,confidence,independent_families,decision,why)
      VALUES ('t',now(),1,'d1',90,90,90,90,90,90,90,3,'auto_execute','x') $q$,
  'a decision that acts without a person cannot be stored');

SELECT pg_temp.must_reject(
  $q$ INSERT INTO growth_briefs
        (brief_id,brief_version,topic_id,opportunity_score,confidence,valid_from,
         expires_at,evidence_ids,audience,intent,approved_claim_ids,cta_id,
         allowed_channels,objective,policy_version,status)
      VALUES ('gb1',1,'t',86,84,now(),now() + interval '7 days',
              '["ev1"]'::jsonb,'a','i','["c1"]'::jsonb,'cta',
              '["seo"]'::jsonb,'o',1,'approved') $q$,
  'a brief cannot be approved by nobody');

SELECT pg_temp.must_reject(
  $q$ INSERT INTO growth_briefs
        (brief_id,brief_version,topic_id,opportunity_score,confidence,valid_from,
         expires_at,evidence_ids,audience,intent,approved_claim_ids,cta_id,
         allowed_channels,objective,policy_version)
      VALUES ('gb2',1,'t',86,84,now(),now() + interval '7 days',
              '[]'::jsonb,'a','i','["c1"]'::jsonb,'cta',
              '["seo"]'::jsonb,'o',1) $q$,
  'a brief with no evidence is rejected');

INSERT INTO growth_briefs
  (brief_id,brief_version,topic_id,opportunity_score,confidence,valid_from,
   expires_at,evidence_ids,audience,intent,approved_claim_ids,cta_id,
   allowed_channels,objective,policy_version,status,approved_by,approved_at)
VALUES ('gb_ok',1,'t_active',86,84,now(),now() + interval '7 days',
        '["ev1"]'::jsonb,'a','i','["c1"]'::jsonb,'cta',
        '["seo"]'::jsonb,'o',1,'approved','editor@example.test',now());

SELECT pg_temp.must_reject(
  $q$ INSERT INTO growth_briefs
        (brief_id,brief_version,topic_id,opportunity_score,confidence,valid_from,
         expires_at,evidence_ids,audience,intent,approved_claim_ids,cta_id,
         allowed_channels,objective,policy_version,status,approved_by,approved_at)
      VALUES ('gb_second',1,'t_active',86,84,now(),now() + interval '7 days',
              '["ev1"]'::jsonb,'a','i','["c1"]'::jsonb,'cta',
              '["seo"]'::jsonb,'o',1,'approved','editor@example.test',now()) $q$,
  'two approved briefs cannot fight over one topic');

SELECT pg_temp.must_reject(
  $q$ INSERT INTO growth_actions
        (brief_id,brief_version,channel,action_kind,target_id,base_revision,
         patch,canonical_patch_hash,idempotency_key,author,state,applied_revision)
      VALUES ('gb_ok',1,'seo','seo_metadata_patch','p1',1,
              '{}'::jsonb,'h1','k1','a','applied',NULL) $q$,
  'an applied action that does not know what it changed is rejected');

INSERT INTO growth_actions
  (brief_id,brief_version,channel,action_kind,target_id,base_revision,
   patch,canonical_patch_hash,idempotency_key,author,state)
VALUES ('gb_ok',1,'seo','seo_metadata_patch','p_ok',1,
        '{}'::jsonb,'h_ok','k_ok','a','queued');

SELECT pg_temp.must_reject(
  $q$ INSERT INTO growth_actions
        (brief_id,brief_version,channel,action_kind,target_id,base_revision,
         patch,canonical_patch_hash,idempotency_key,author,state)
      VALUES ('gb_ok',1,'seo','seo_metadata_patch','p_ok',1,
              '{}'::jsonb,'h2','k2','a','queued') $q$,
  'two actions cannot be in flight against one target');

SELECT pg_temp.must_reject(
  $q$ INSERT INTO growth_actions
        (brief_id,brief_version,channel,action_kind,target_id,base_revision,
         patch,canonical_patch_hash,idempotency_key,author)
      VALUES ('gb_ok',1,'seo','seo_metadata_patch','p_other',1,
              '{}'::jsonb,'h3','k_ok','a') $q$,
  'a replayed idempotency key cannot create a second action');

SELECT pg_temp.must_reject(
  $q$ INSERT INTO trend_outcomes
        (experiment_id,variant,denominator,conversions,window_start,window_end)
      VALUES ('nope','a',10,2,now() - interval '1 day',now()) $q$,
  'an outcome for an unknown experiment is rejected');

INSERT INTO trend_experiments
  (experiment_id,brief_id,hypothesis,primary_outcome,baseline,control_method,
   window_start,window_end,owner)
VALUES ('exp_ok','gb_ok','h','engaged_read','{}'::jsonb,'matched_untreated',
        now() - interval '1 day',now() + interval '7 days','owner@example.test');

SELECT pg_temp.must_reject(
  $q$ INSERT INTO trend_outcomes
        (experiment_id,variant,denominator,conversions,window_start,window_end)
      VALUES ('exp_ok','a',10,11,now() - interval '1 day',now()) $q$,
  'more conversions than eligible sessions is rejected');

SELECT pg_temp.must_reject(
  $q$ UPDATE trend_experiments SET verdict = 'it worked' WHERE experiment_id = 'exp_ok' $q$,
  'an invented experiment verdict is rejected');

SELECT 'ok   — trend observations, briefs, actions and outcomes hold their promises';

ROLLBACK;
