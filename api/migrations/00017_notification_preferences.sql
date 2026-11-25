CREATE TABLE IF NOT EXISTS notification_preferences (
    username TEXT PRIMARY KEY REFERENCES app_users(username) ON DELETE CASCADE,
    collector_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    data_plan_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    device_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    report_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_acknowledgements (
    username TEXT NOT NULL REFERENCES app_users(username) ON DELETE CASCADE,
    alert_key TEXT NOT NULL,
    read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (username, alert_key),
    CHECK (length(alert_key) BETWEEN 1 AND 240)
);

CREATE INDEX IF NOT EXISTS alert_acknowledgements_read_idx
    ON alert_acknowledgements (username, read_at DESC);
