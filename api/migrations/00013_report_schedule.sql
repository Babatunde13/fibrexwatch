CREATE TABLE IF NOT EXISTS report_schedule_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    frequency TEXT NOT NULL DEFAULT 'off' CHECK (frequency IN ('off', 'weekly', 'monthly')),
    weekday SMALLINT NOT NULL DEFAULT 1 CHECK (weekday BETWEEN 0 AND 6),
    month_day SMALLINT NOT NULL DEFAULT 1 CHECK (month_day BETWEEN 1 AND 28),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO report_schedule_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
