-- ============================================================
-- 0031 — Native device push tokens.
--
-- Web Push was finished and correct: RFC 8291 encryption against the
-- spec's own test vector, a real VAPID signature, a service worker that
-- renders the notification, and a scheduler that decides when to speak.
-- All of it reaches a browser. None of it reaches the installed app.
--
-- A Capacitor webview has no PushManager — not on iOS, where Safari's
-- push is a Home Screen web app feature the shell is not, and not in
-- Android's System WebView, which has no push at all. So
-- `account-panel.tsx` reads `'PushManager' in window`, finds nothing, and
-- tells the member notifications are unsupported. In the application that
-- exists to deliver them.
--
-- A native registration is a different shape from a web one and gets its
-- own table rather than a nullable half of push_subscriptions. Web Push
-- is an https endpoint plus two encryption keys, because the payload is
-- encrypted to the device and the push service relays bytes it cannot
-- read. APNs and FCM are an opaque token, with the transport encrypting
-- to itself and the vendor able to read the alert text. Those are not the
-- same guarantee, and a schema that pretended they were would make the
-- weaker one invisible.
--
-- Which is also why the notification body stays what it already is — a
-- movement name and a duration. Nothing about a health reading, a
-- symptom, a body measurement or a wallet balance goes through a vendor's
-- push infrastructure.
-- ============================================================

CREATE TABLE IF NOT EXISTS device_push_tokens (
  -- APNs device tokens and FCM registration tokens are both opaque and
  -- both unique per app install, so the token is the identity.
  token       text PRIMARY KEY,
  user_id     text,
  -- apns: Apple's own service, reached directly with a p8 key.
  -- fcm: Firebase Cloud Messaging, which is the only way to reach
  -- Android and is an already-approved vendor.
  transport   text NOT NULL CHECK (transport IN ('apns', 'fcm')),

  -- Same reason as push_subscriptions: the scheduler runs in UTC and has
  -- to know whether it is eleven in the morning where the member is.
  -- Nullable, and a null is skipped rather than guessed at.
  utc_offset_minutes smallint,

  created_at   timestamptz NOT NULL DEFAULT now(),
  -- Refreshed every time the app registers. APNs and FCM both rotate
  -- tokens, and a token nothing has re-registered for months is a device
  -- that is gone; the delivery path deletes on an explicit rejection, and
  -- this is what makes a silent disappearance visible.
  last_seen_at timestamptz NOT NULL DEFAULT now(),

  -- An empty string is not a token, and a token long enough to be a
  -- payload is not one either. FCM registration tokens run to about 200
  -- characters; 4096 is generous and still a ceiling.
  CONSTRAINT device_push_token_shaped CHECK (length(token) BETWEEN 16 AND 4096)
);

CREATE INDEX IF NOT EXISTS device_push_tokens_user_idx ON device_push_tokens (user_id);
