package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/local/mtn-fibrex/api/internal/router"
)

func (s *Store) RecordConnectionReading(ctx context.Context, source string, reading router.TrafficCounters) error {
	if source == "" {
		return fmt.Errorf("reading source is required")
	}
	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin reading transaction: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var previous router.TrafficCounters
	err = tx.QueryRow(ctx, `
		select
			recorded_at,
			download_total_bytes,
			upload_total_bytes,
			router_uptime_seconds
		from router_readings
		where collection_status='ok'
			and source=$1
		order by recorded_at desc
		limit 1
		for update`, source).Scan(&previous.RecordedAt, &previous.DownloadBytes, &previous.UploadBytes, &previous.UptimeSeconds)
	if err != nil && !isNoRows(err) {
		return fmt.Errorf("select previous reading: %w", err)
	}

	_, err = tx.Exec(ctx, `
		insert into router_readings (
			recorded_at,download_total_bytes,upload_total_bytes,
			router_uptime_seconds,collection_status,source
		) values ($1,$2,$3,$4,'ok',$5)
		on conflict (recorded_at) do nothing`, reading.RecordedAt, reading.DownloadBytes, reading.UploadBytes, reading.UptimeSeconds, source)
	if err != nil {
		return fmt.Errorf("insert router reading: %w", err)
	}

	if !previous.RecordedAt.IsZero() && reading.RecordedAt.After(previous.RecordedAt) {
		delta := router.CalculateDelta(previous, reading)
		_, err = tx.Exec(ctx, `
			insert into usage_intervals (
				device_id,started_at,ended_at,download_bytes,
				upload_bytes,estimated,source
			) values (null,$1,$2,$3,$4,$5,$6)`, previous.RecordedAt, reading.RecordedAt, delta.DownloadBytes, delta.UploadBytes, reading.RecordedAt.Sub(previous.RecordedAt) > 2*time.Minute, source)
		if err != nil {
			return fmt.Errorf("insert usage interval: %w", err)
		}
		if delta.Reset {
			_, err = tx.Exec(ctx, `
				insert into collector_events (event_type,detail)
				values ('counter_reset',$1)`, fmt.Sprintf(`{"recordedAt":%q}`, reading.RecordedAt.Format(time.RFC3339Nano)))
			if err != nil {
				return fmt.Errorf("insert reset event: %w", err)
			}
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit reading transaction: %w", err)
	}
	return nil
}

func (s *Store) PruneRawData(ctx context.Context, before time.Time) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin raw data pruning: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	if _, err := tx.Exec(ctx, `
		delete from device_readings
		where recorded_at<$1`, before); err != nil {
		return fmt.Errorf("prune device readings: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		delete from router_readings
		where recorded_at<$1`, before); err != nil {
		return fmt.Errorf("prune router readings: %w", err)
	}
	return tx.Commit(ctx)
}
