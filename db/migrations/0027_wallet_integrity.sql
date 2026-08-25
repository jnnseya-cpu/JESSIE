-- ============================================================
-- 0027 — Wallet integrity.
--
-- Two defects, both of which lose real money, both invisible in a
-- single-instance test:
--
--   1. The wallet snapshot was written last-write-wins. Two serverless
--      instances each hydrated the row once, never re-read it, and each
--      wrote its own whole-wallet JSON back. Instance A spends 500 ACU
--      and saves; instance B, still holding the pre-spend copy, spends
--      500 and saves over it. The provider was called twice and the
--      ledger records one spend. Repeatable for as long as there is more
--      than one instance, which on Vercel is always.
--
--      `version` makes the write conditional. A save that does not match
--      the version it read is rejected, the caller re-reads and retries,
--      and a spend can no longer be silently erased by a concurrent one.
--
--   2. Money removed from a wallet had nowhere to be recorded. A Stripe
--      refund or dispute has to take the allowance back, and taking
--      allowance away is exactly the operation that must never happen
--      quietly — `wallet_adjustments` is the counterpart to the
--      `sourceRef` every grant already carries, so a balance that goes
--      down has as much provenance as one that goes up.
--
-- `shortfall_acus` is the part that could not be recovered because it had
-- already been spent. It is not an error and it is not a debt — the
-- platform's rule is that a wallet never goes negative. It is the
-- measured loss on that refund, kept so it can be counted rather than
-- discovered.
-- ============================================================

ALTER TABLE app_wallets ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS wallet_adjustments (
  id             bigserial PRIMARY KEY,
  wallet_id      text NOT NULL,
  -- Why the allowance was removed. A refund and a dispute are different
  -- events with different follow-up, so they are not flattened into one.
  kind           text NOT NULL CHECK (kind IN ('refund', 'dispute', 'correction')),
  -- The Stripe object that caused it. Unique per kind, so a redelivered
  -- webhook cannot claw the same charge back twice even if the event-level
  -- idempotency table is ever lost.
  reference      text NOT NULL,
  gbp            numeric(10, 2) NOT NULL CHECK (gbp >= 0),
  clawed_acus    integer NOT NULL CHECK (clawed_acus >= 0),
  shortfall_acus integer NOT NULL DEFAULT 0 CHECK (shortfall_acus >= 0),
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT wallet_adjustments_once UNIQUE (kind, reference)
);

CREATE INDEX IF NOT EXISTS wallet_adjustments_wallet_idx
  ON wallet_adjustments (wallet_id, created_at DESC);

-- A shortfall is the money already gone. Finding them should not need a
-- table scan on the day somebody asks how much refund abuse has cost.
CREATE INDEX IF NOT EXISTS wallet_adjustments_shortfall_idx
  ON wallet_adjustments (created_at DESC) WHERE shortfall_acus > 0;

-- ------------------------------------------------------------------
-- Who a Stripe customer is, and what they are subscribed to.
--
-- Both of these lived in a Map on one instance. On serverless that means
-- they exist for whichever instance happened to serve the checkout and
-- nowhere else, and they are gone entirely after a recycle.
--
-- It matters because of what reads them. A refund or a dispute arrives
-- naming a customer, not a member; without this link the reversal cannot
-- find the wallet, and a reversal that cannot find the wallet is a
-- reversal that does not happen. The billing portal has the same problem
-- from the other direction — it has to resolve the caller's own customer
-- id server-side, and it cannot do that from a map it does not have.
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS stripe_customers (
  customer_id text PRIMARY KEY,
  user_id     text NOT NULL,
  linked_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stripe_customers_user_idx ON stripe_customers (user_id);

CREATE TABLE IF NOT EXISTS stripe_subscriptions (
  subscription_id     text PRIMARY KEY,
  customer_id         text NOT NULL,
  user_id             text NOT NULL,
  plan                text,
  state               text NOT NULL,
  current_period_end  timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  -- When the state last moved. The past-due grace period is measured from
  -- here, so it has to be the transition time and not a row touch.
  state_since         timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stripe_subscriptions_user_idx ON stripe_subscriptions (user_id);
