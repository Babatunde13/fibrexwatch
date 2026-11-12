package store

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

func (s *Store) GetReportSchedule(ctx context.Context) (ReportSchedule, error) {
	var schedule ReportSchedule
	err := s.db.QueryRow(ctx, `
		select frequency,weekday,month_day,updated_at
		from report_schedule_settings where id=1`).Scan(
		&schedule.Frequency, &schedule.Weekday, &schedule.MonthDay, &schedule.UpdatedAt,
	)
	if err != nil {
		return ReportSchedule{}, fmt.Errorf("get report schedule: %w", err)
	}
	return schedule, nil
}

func (s *Store) GenerateScheduledReport(ctx context.Context, source, timezone string, now time.Time) (*GeneratedReport, error) {
	schedule, err := s.GetReportSchedule(ctx)
	if err != nil || schedule.Frequency == "off" {
		return nil, err
	}
	closeAt := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	if schedule.Frequency == "weekly" {
		daysSinceClose := (int(now.Weekday()) - schedule.Weekday + 7) % 7
		closeAt = closeAt.AddDate(0, 0, -daysSinceClose)
	} else {
		closeAt = time.Date(now.Year(), now.Month(), schedule.MonthDay, 0, 0, 0, 0, now.Location())
		if now.Before(closeAt) {
			closeAt = closeAt.AddDate(0, -1, 0)
		}
	}
	start := closeAt.AddDate(0, 0, -7)
	if schedule.Frequency == "monthly" {
		start = closeAt.AddDate(0, -1, 0)
	}
	history, err := s.DailyUsageHistory(ctx, source, timezone, start, closeAt)
	if err != nil {
		return nil, fmt.Errorf("generate report history: %w", err)
	}
	days := make([]ReportDay, 0, len(history))
	var download, upload, readings int64
	for _, item := range history {
		download += item.DownloadBytes
		upload += item.UploadBytes
		readings += item.ReadingCount
		days = append(days, ReportDay{
			Date: item.Date.Format(time.DateOnly), DownloadBytes: item.DownloadBytes,
			UploadBytes: item.UploadBytes, TotalBytes: item.DownloadBytes + item.UploadBytes,
			ReadingCount: item.ReadingCount,
		})
	}
	encoded, err := json.Marshal(days)
	if err != nil {
		return nil, fmt.Errorf("encode generated report: %w", err)
	}
	var report GeneratedReport
	err = s.db.QueryRow(ctx, `
		insert into generated_reports
			(source,frequency,period_start,period_end,download_bytes,upload_bytes,reading_count,report_data)
		values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
		on conflict (source,frequency,period_start,period_end) do nothing
		returning id,source,frequency,period_start,period_end,download_bytes,upload_bytes,reading_count,generated_at`,
		source, schedule.Frequency, start, closeAt.AddDate(0, 0, -1), download, upload, readings, string(encoded),
	).Scan(
		&report.ID, &report.Source, &report.Frequency, &report.PeriodStart, &report.PeriodEnd,
		&report.DownloadBytes, &report.UploadBytes, &report.ReadingCount, &report.GeneratedAt,
	)
	if isNoRows(err) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("store generated report: %w", err)
	}
	report.Days = days
	return &report, nil
}

func (s *Store) ListGeneratedReports(ctx context.Context, source string, limit int) ([]GeneratedReport, error) {
	rows, err := s.db.Query(ctx, `
		select id,source,frequency,period_start,period_end,download_bytes,upload_bytes,reading_count,generated_at
		from generated_reports where source=$1 order by period_end desc limit $2`, source, limit)
	if err != nil {
		return nil, fmt.Errorf("list generated reports: %w", err)
	}
	defer rows.Close()
	reports := make([]GeneratedReport, 0)
	for rows.Next() {
		var report GeneratedReport
		if err := rows.Scan(
			&report.ID, &report.Source, &report.Frequency, &report.PeriodStart, &report.PeriodEnd,
			&report.DownloadBytes, &report.UploadBytes, &report.ReadingCount, &report.GeneratedAt,
		); err != nil {
			return nil, fmt.Errorf("scan generated report: %w", err)
		}
		reports = append(reports, report)
	}
	return reports, rows.Err()
}

func (s *Store) GetGeneratedReport(ctx context.Context, source string, id int64) (*GeneratedReport, error) {
	var report GeneratedReport
	var encoded []byte
	err := s.db.QueryRow(ctx, `
		select id,source,frequency,period_start,period_end,download_bytes,upload_bytes,reading_count,report_data,generated_at
		from generated_reports where source=$1 and id=$2`, source, id).Scan(
		&report.ID, &report.Source, &report.Frequency, &report.PeriodStart, &report.PeriodEnd,
		&report.DownloadBytes, &report.UploadBytes, &report.ReadingCount, &encoded, &report.GeneratedAt,
	)
	if isNoRows(err) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get generated report: %w", err)
	}
	if err := json.Unmarshal(encoded, &report.Days); err != nil {
		return nil, fmt.Errorf("decode generated report: %w", err)
	}
	return &report, nil
}

func (s *Store) SaveReportSchedule(ctx context.Context, schedule ReportSchedule) (ReportSchedule, error) {
	err := s.db.QueryRow(ctx, `
		update report_schedule_settings
		set frequency=$1,weekday=$2,month_day=$3,updated_at=now()
		where id=1
		returning frequency,weekday,month_day,updated_at`,
		schedule.Frequency, schedule.Weekday, schedule.MonthDay,
	).Scan(&schedule.Frequency, &schedule.Weekday, &schedule.MonthDay, &schedule.UpdatedAt)
	if err != nil {
		return ReportSchedule{}, fmt.Errorf("save report schedule: %w", err)
	}
	return schedule, nil
}
