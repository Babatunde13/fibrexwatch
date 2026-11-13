CREATE TABLE IF NOT EXISTS network_quality_readings (
    id BIGSERIAL PRIMARY KEY,
    source TEXT NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    gateway_reachable BOOLEAN NOT NULL,
    gateway_latency_ms INTEGER,
    gateway_loss_percent SMALLINT NOT NULL CHECK (gateway_loss_percent BETWEEN 0 AND 100),
    internet_reachable BOOLEAN NOT NULL,
    internet_latency_ms INTEGER,
    internet_loss_percent SMALLINT NOT NULL CHECK (internet_loss_percent BETWEEN 0 AND 100),
    dns_reachable BOOLEAN NOT NULL,
    dns_latency_ms INTEGER
);

CREATE INDEX IF NOT EXISTS network_quality_source_recorded_idx
    ON network_quality_readings (source, recorded_at DESC);
