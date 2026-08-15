CREATE TABLE IF NOT EXISTS router_readings (
    id BIGSERIAL PRIMARY KEY,
    recorded_at TIMESTAMPTZ NOT NULL,
    download_total_bytes BIGINT CHECK (download_total_bytes >= 0),
    upload_total_bytes BIGINT CHECK (upload_total_bytes >= 0),
    router_uptime_seconds BIGINT CHECK (router_uptime_seconds >= 0),
    collection_status TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'legacy',
    UNIQUE (recorded_at)
);

CREATE TABLE IF NOT EXISTS devices (
    id BIGSERIAL PRIMARY KEY,
    mac_address TEXT NOT NULL UNIQUE,
    hostname TEXT,
    display_name TEXT,
    manufacturer TEXT,
    first_seen_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS device_addresses (
    id BIGSERIAL PRIMARY KEY,
    device_id BIGINT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    ip_address INET NOT NULL,
    first_seen_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL,
    UNIQUE (device_id, ip_address)
);

CREATE TABLE IF NOT EXISTS device_readings (
    id BIGSERIAL PRIMARY KEY,
    device_id BIGINT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    recorded_at TIMESTAMPTZ NOT NULL,
    download_total_bytes BIGINT CHECK (download_total_bytes >= 0),
    upload_total_bytes BIGINT CHECK (upload_total_bytes >= 0),
    online BOOLEAN NOT NULL,
    UNIQUE (device_id, recorded_at)
);

CREATE TABLE IF NOT EXISTS usage_intervals (
    id BIGSERIAL PRIMARY KEY,
    device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ NOT NULL,
    download_bytes BIGINT NOT NULL CHECK (download_bytes >= 0),
    upload_bytes BIGINT NOT NULL CHECK (upload_bytes >= 0),
    estimated BOOLEAN NOT NULL DEFAULT FALSE,
    source TEXT NOT NULL DEFAULT 'legacy',
    CHECK (ended_at > started_at)
);

CREATE TABLE IF NOT EXISTS collector_events (
    id BIGSERIAL PRIMARY KEY,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    event_type TEXT NOT NULL,
    detail JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS router_readings_recorded_at_idx ON router_readings (recorded_at DESC);
CREATE INDEX IF NOT EXISTS device_readings_device_recorded_idx ON device_readings (device_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS usage_intervals_started_at_idx ON usage_intervals (started_at DESC);
CREATE INDEX IF NOT EXISTS usage_intervals_device_started_idx ON usage_intervals (device_id, started_at DESC);
