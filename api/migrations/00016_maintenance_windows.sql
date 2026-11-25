CREATE TABLE IF NOT EXISTS maintenance_windows (
    id BIGSERIAL PRIMARY KEY,
    source TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('one-off', 'weekly')),
    label TEXT NOT NULL,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    weekdays SMALLINT[] NOT NULL DEFAULT '{}',
    start_minute SMALLINT,
    duration_minutes SMALLINT,
    timezone TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cancelled_by TEXT,
    cancelled_at TIMESTAMPTZ,
    CHECK (
        (kind = 'one-off' AND starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at > starts_at)
        OR
        (kind = 'weekly' AND cardinality(weekdays) > 0 AND start_minute BETWEEN 0 AND 1439 AND duration_minutes BETWEEN 15 AND 1440)
    )
);

CREATE INDEX IF NOT EXISTS maintenance_windows_source_created_idx
    ON maintenance_windows (source, created_at DESC);
