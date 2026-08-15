ALTER TABLE devices ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS devices_archived_at_idx ON devices (archived_at);
