CREATE TABLE IF NOT EXISTS data_plan_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    allowance_bytes BIGINT NOT NULL DEFAULT 0 CHECK (allowance_bytes >= 0),
    billing_day SMALLINT NOT NULL DEFAULT 1 CHECK (billing_day BETWEEN 1 AND 28),
    alert_thresholds INTEGER[] NOT NULL DEFAULT ARRAY[50, 75, 90, 100],
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO data_plan_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
