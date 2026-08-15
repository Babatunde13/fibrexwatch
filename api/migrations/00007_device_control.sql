ALTER TABLE devices ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS device_control_requests (
    id BIGSERIAL PRIMARY KEY,
    device_id BIGINT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN ('block')),
    ssid_name TEXT NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS device_control_requests_pending_idx
    ON device_control_requests (device_id, action)
    WHERE completed_at IS NULL;
