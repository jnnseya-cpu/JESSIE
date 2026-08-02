-- Where the app remembers what you were doing.
--
-- A member fills in their height, scans a trolley of products, gets an
-- analysis back, then locks the phone — and everything is gone. That is
-- not a small annoyance; it is the reason people stop opening an app.
--
-- One row per key per person, holding a small JSON document. Deliberately
-- not a table per feature: the operations are all "save this, give it
-- back", and a single shape keeps that honest and easy to audit.
--
-- Nothing sensitive belongs here. The autosave policy in the engine names
-- the fields that may never be saved without an explicit act — consent,
-- date of birth, clinical flags — and the service refuses those keys.

CREATE TABLE IF NOT EXISTS member_state (
  user_id    text        NOT NULL,
  key        text        NOT NULL,
  value      jsonb       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

CREATE INDEX IF NOT EXISTS member_state_by_user ON member_state (user_id);
