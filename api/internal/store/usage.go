package store

import (
	"context"
	"fmt"
	"time"
)

func (s *Store) UsageHistory(ctx context.Context, source, timezone, granularity string, start, end time.Time) ([]UsagePoint, error) {
	unit := map[string]string{"hour": "hour", "day": "day", "week": "week", "month": "month"}[granularity]
	if unit == "" {
		return nil, fmt.Errorf("unsupported usage granularity %q", granularity)
	}
	query := fmt.Sprintf(`
		select
			date_trunc('%s',ended_at at time zone $4),
			coalesce(sum(download_bytes),0),
			coalesce(sum(upload_bytes),0),
			count(*)
		from usage_intervals
		where device_id is null
			and source=$1
			and ended_at>$2
			and ended_at<=$3
		group by 1
		order by 1`, unit)
	rows, err := s.db.Query(ctx, query, source, start, end, timezone)
	if err != nil {
		return nil, fmt.Errorf("query usage history: %w", err)
	}
	defer rows.Close()
	items := make([]UsagePoint, 0)
	for rows.Next() {
		var item UsagePoint
		if err := rows.Scan(&item.Period, &item.DownloadBytes, &item.UploadBytes, &item.ReadingCount); err != nil {
			return nil, fmt.Errorf("scan usage history: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) DailyUsageHistory(ctx context.Context, source, timezone string, start, end time.Time) ([]DailyUsage, error) {
	rows, err := s.db.Query(ctx, `
		select
			date_trunc('day',ended_at at time zone $4)::date,
			coalesce(sum(download_bytes),0),
			coalesce(sum(upload_bytes),0),
			count(*)
		from usage_intervals
		where device_id is null
			and source=$1
			and ended_at>$2
			and ended_at<=$3
		group by 1
		order by 1`, source, start, end, timezone)
	if err != nil {
		return nil, fmt.Errorf("query daily usage history: %w", err)
	}
	defer rows.Close()
	items := make([]DailyUsage, 0)
	for rows.Next() {
		var item DailyUsage
		if err := rows.Scan(&item.Date, &item.DownloadBytes, &item.UploadBytes, &item.ReadingCount); err != nil {
			return nil, fmt.Errorf("scan daily usage history: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) SummarizeUsage(ctx context.Context, source string, start, end time.Time) (UsageSummary, error) {
	var us UsageSummary
	err := s.db.QueryRow(ctx, `
		select
			coalesce(sum(download_bytes),0),
			coalesce(sum(upload_bytes),0),
			count(*)
		from usage_intervals
		where device_id is null
			and source=$1
			and ended_at>$2
			and ended_at<=$3`,
		source,
		start,
		end).Scan(&us.DownloadBytes, &us.UploadBytes, &us.ReadingCount)
	if err != nil {
		return UsageSummary{}, fmt.Errorf("summarize usage: %w", err)
	}
	err = s.db.QueryRow(ctx,
		`select
			count(*)
		from (
			select
				distinct on (device_id) device_id, online
			from device_readings
			order by device_id, recorded_at desc
		)
		latest
		where online
	`).Scan(&us.ActiveDevices)
	if err != nil {
		return UsageSummary{}, fmt.Errorf("count active devices: %w", err)
	}
	return us, nil
}

func (s *Store) LatestReadingTime(ctx context.Context, source string) (*time.Time, error) {
	var recordedAt *time.Time
	if err := s.db.QueryRow(ctx, `
		select
			max(recorded_at)
		from router_readings
		where
			collection_status='ok'
			and source=$1
		`, source).Scan(&recordedAt); err != nil {
		return nil, fmt.Errorf("latest reading: %w", err)
	}
	return recordedAt, nil
}
