CREATE TABLE IF NOT EXISTS generated_reports (
    id BIGSERIAL PRIMARY KEY,
    source TEXT NOT NULL,
    frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    download_bytes BIGINT NOT NULL DEFAULT 0,
    upload_bytes BIGINT NOT NULL DEFAULT 0,
    reading_count BIGINT NOT NULL DEFAULT 0,
    report_data JSONB NOT NULL DEFAULT '[]'::jsonb,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source, frequency, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS generated_reports_recent_idx
    ON generated_reports (source, generated_at DESC);
