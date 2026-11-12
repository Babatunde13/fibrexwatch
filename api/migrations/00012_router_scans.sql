CREATE TABLE IF NOT EXISTS router_scan_requests (
    id BIGSERIAL PRIMARY KEY,
    source TEXT NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error TEXT NOT NULL DEFAULT '',
    result JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS router_scan_requests_latest_idx
    ON router_scan_requests (source, requested_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS router_scan_requests_pending_idx
    ON router_scan_requests (source)
    WHERE completed_at IS NULL;
