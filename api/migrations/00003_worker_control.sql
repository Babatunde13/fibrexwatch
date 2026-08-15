CREATE TABLE IF NOT EXISTS worker_status (
    source TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    heartbeat_at TIMESTAMPTZ NOT NULL,
    last_attempt_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    last_error TEXT NOT NULL DEFAULT '',
    consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0)
);

CREATE TABLE IF NOT EXISTS collection_requests (
    id BIGSERIAL PRIMARY KEY,
    source TEXT NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    error TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS collection_requests_pending_idx
    ON collection_requests (source, requested_at)
    WHERE completed_at IS NULL;
