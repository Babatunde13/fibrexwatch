ALTER TABLE router_readings ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE usage_intervals ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'legacy';

-- All readings created before source tracking came from the development simulator.
UPDATE router_readings SET source = 'simulated' WHERE source = 'legacy';
UPDATE usage_intervals SET source = 'simulated' WHERE source = 'legacy';

CREATE INDEX IF NOT EXISTS router_readings_source_recorded_idx ON router_readings (source, recorded_at DESC);
CREATE INDEX IF NOT EXISTS usage_intervals_source_started_idx ON usage_intervals (source, started_at DESC);
