-- Outbound mail, durably.
--
-- The mail log started in process memory, which on serverless means every
-- instance keeps a private diary and /mail/status is an instance lottery.
-- Delivery diagnostics have to survive both restarts and fan-out, so the
-- log lives here. The `detail` column carries the server's final reply on
-- success and the exact failure reason otherwise — it is the column that
-- answers "did the reset email actually go out, and if not, why".

CREATE TABLE IF NOT EXISTS mail_log (
  id         bigserial PRIMARY KEY,
  event      text        NOT NULL,
  recipient  text        NOT NULL,
  subject    text        NOT NULL,
  status     text        NOT NULL CHECK (status IN ('sent', 'sandbox', 'failed')),
  detail     text        NOT NULL DEFAULT '',
  at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mail_log_at_idx ON mail_log (at DESC);
CREATE INDEX IF NOT EXISTS mail_log_status_idx ON mail_log (status);
