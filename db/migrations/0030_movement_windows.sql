-- ============================================================
-- 0030 — Declared movement windows, and the local time to read them in.
--
-- The platform could not start a conversation. Web push was finished —
-- VAPID, encrypted payloads, a service-worker handler, tests — and the
-- only scheduled job in the repository wrote the blog. Nothing ever
-- decided that now was a good moment for a particular person, so the
-- product was a button you had to remember to press. For something whose
-- whole argument is "we find the gap in your day", that is the argument
-- not being made.
--
-- The obvious fix — a cron that pushes hourly — is the one thing
-- context.service.ts explicitly refuses: "No positive availability
-- signal and no declared schedule: defer. A fixed-timer fallback is not
-- permitted." A blind timer is the generic reminder app the landing page
-- exists to criticise, and it would earn the same 11% it criticises.
--
-- `declared_schedule` is already a first-class SignalClass and is named
-- in that very comment. It needs no sensor, no calendar vendor and no
-- native app: the member says when they are usually free, and the engine
-- speaks only inside those windows and only when the cap, the cooldown,
-- quiet hours and the sleep window all allow it. That is a real basis,
-- honestly obtained, and it is the difference between a schedule and a
-- timer.
--
-- Minutes-since-midnight rather than a time type, because the arithmetic
-- the scheduler does is minute arithmetic and a `time` column would only
-- be converted back. Weekday 0 = Sunday, matching JavaScript's getDay().
-- ============================================================

CREATE TABLE IF NOT EXISTS member_windows (
  user_id      text     NOT NULL,
  weekday      smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_minute smallint NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute   smallint NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
  created_at   timestamptz NOT NULL DEFAULT now(),

  -- A window that ends before it starts is not a window. Enforced here
  -- rather than in the service, so it stays true after a refactor.
  CONSTRAINT member_windows_ordered CHECK (end_minute > start_minute),
  -- A Snap needs somewhere to fit. Below five minutes there is no gap.
  CONSTRAINT member_windows_long_enough CHECK (end_minute - start_minute >= 5),
  CONSTRAINT member_windows_once UNIQUE (user_id, weekday, start_minute)
);

CREATE INDEX IF NOT EXISTS member_windows_user_idx ON member_windows (user_id);

-- The scheduler runs in UTC and has to decide whether it is 11:00 where
-- the member is. The browser knows its own offset at subscribe time and
-- is the only thing that does; nothing else on the platform records it.
-- Nullable, because a subscription made before this migration has no
-- offset and must not be guessed at — the scheduler skips those rather
-- than nudging somebody at four in the morning.
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS utc_offset_minutes smallint;

-- What the scheduler actually did, so a member who asks "why did nothing
-- happen at eleven?" gets an answer rather than a shrug. Small and
-- append-only; the run keeps the most recent decision per member.
CREATE TABLE IF NOT EXISTS nudge_runs (
  id         bigserial PRIMARY KEY,
  user_id    text        NOT NULL,
  -- offered: a Snap was pushed. held: the engine chose silence, which is
  -- a success. skipped: the member was outside every declared window.
  outcome    text        NOT NULL CHECK (outcome IN ('offered', 'held', 'skipped', 'failed')),
  reason     text,
  at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nudge_runs_user_at_idx ON nudge_runs (user_id, at DESC);
