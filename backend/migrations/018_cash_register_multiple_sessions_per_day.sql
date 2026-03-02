BEGIN;

-- Allow multiple sessions per day, but only one open session at a time.
ALTER TABLE cash_register_sessions
DROP CONSTRAINT IF EXISTS cash_register_sessions_date_key;

DROP INDEX IF EXISTS cash_register_sessions_date_key;
DROP INDEX IF EXISTS uq_cash_register_one_open_per_day;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_register_one_open_per_day
ON cash_register_sessions(date)
WHERE status = 'ABIERTA';

COMMIT;
