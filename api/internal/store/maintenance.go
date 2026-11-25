package store

import (
	"context"
	"fmt"
	"time"
)

type MaintenanceInput struct {
	Source          string
	Kind            string
	Label           string
	StartsAt        *time.Time
	EndsAt          *time.Time
	Weekdays        []int16
	StartMinute     *int16
	DurationMinutes *int16
	Timezone        string
	CreatedBy       string
}

func (s *Store) CreateMaintenanceWindow(ctx context.Context, input MaintenanceInput) (MaintenanceWindow, error) {
	var window MaintenanceWindow
	err := s.db.QueryRow(ctx, `
		insert into maintenance_windows (
			source,kind,label,starts_at,ends_at,weekdays,start_minute,duration_minutes,timezone,created_by
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		returning id,source,kind,label,starts_at,ends_at,weekdays,start_minute,duration_minutes,
			timezone,created_by,created_at,coalesce(cancelled_by,''),cancelled_at`,
		input.Source, input.Kind, input.Label, input.StartsAt, input.EndsAt, input.Weekdays,
		input.StartMinute, input.DurationMinutes, input.Timezone, input.CreatedBy,
	).Scan(&window.ID, &window.Source, &window.Kind, &window.Label, &window.StartsAt,
		&window.EndsAt, &window.Weekdays, &window.StartMinute, &window.DurationMinutes,
		&window.Timezone, &window.CreatedBy, &window.CreatedAt, &window.CancelledBy,
		&window.CancelledAt)
	return window, err
}

func (s *Store) ListMaintenanceWindows(ctx context.Context, source string, limit int) ([]MaintenanceWindow, error) {
	rows, err := s.db.Query(ctx, `
		select id,source,kind,label,starts_at,ends_at,weekdays,start_minute,duration_minutes,
			timezone,created_by,created_at,coalesce(cancelled_by,''),cancelled_at
		from maintenance_windows where source=$1
		order by (cancelled_at is null) desc, created_at desc limit $2`, source, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	windows := []MaintenanceWindow{}
	for rows.Next() {
		var window MaintenanceWindow
		if err := rows.Scan(&window.ID, &window.Source, &window.Kind, &window.Label,
			&window.StartsAt, &window.EndsAt, &window.Weekdays, &window.StartMinute,
			&window.DurationMinutes, &window.Timezone, &window.CreatedBy, &window.CreatedAt,
			&window.CancelledBy, &window.CancelledAt); err != nil {
			return nil, err
		}
		windows = append(windows, window)
	}
	return windows, rows.Err()
}

func (s *Store) CancelMaintenanceWindow(ctx context.Context, source string, id int64, username string) (bool, error) {
	result, err := s.db.Exec(ctx, `
		update maintenance_windows set cancelled_by=$3,cancelled_at=now()
		where id=$1 and source=$2 and cancelled_at is null`, id, source, username)
	return result.RowsAffected() == 1, err
}

func ActiveMaintenance(windows []MaintenanceWindow, now time.Time) *MaintenanceWindow {
	for i := range windows {
		if windows[i].CancelledAt == nil && windows[i].ActiveAt(now) {
			return &windows[i]
		}
	}
	return nil
}

func (w MaintenanceWindow) ActiveAt(now time.Time) bool {
	if w.CancelledAt != nil {
		return false
	}
	if w.Kind == "one-off" {
		return w.StartsAt != nil && w.EndsAt != nil && !now.Before(*w.StartsAt) && now.Before(*w.EndsAt)
	}
	location, err := time.LoadLocation(w.Timezone)
	if err != nil || w.StartMinute == nil || w.DurationMinutes == nil {
		return false
	}
	local := now.In(location)
	for _, dayOffset := range []int{0, -1} {
		day := local.AddDate(0, 0, dayOffset)
		if !containsWeekday(w.Weekdays, int16(day.Weekday())) {
			continue
		}
		midnight := time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, location)
		start := midnight.Add(time.Duration(*w.StartMinute) * time.Minute)
		end := start.Add(time.Duration(*w.DurationMinutes) * time.Minute)
		if !local.Before(start) && local.Before(end) {
			return true
		}
	}
	return false
}

func containsWeekday(days []int16, day int16) bool {
	for _, candidate := range days {
		if candidate == day {
			return true
		}
	}
	return false
}

func ValidateMaintenanceInput(input MaintenanceInput) error {
	if input.Label == "" || len(input.Label) > 120 {
		return fmt.Errorf("label must be between 1 and 120 characters")
	}
	if input.Kind == "one-off" {
		if input.StartsAt == nil || input.EndsAt == nil || !input.EndsAt.After(*input.StartsAt) {
			return fmt.Errorf("one-off maintenance requires a valid start and end")
		}
		if input.EndsAt.Sub(*input.StartsAt) > 7*24*time.Hour {
			return fmt.Errorf("one-off maintenance cannot exceed 7 days")
		}
		return nil
	}
	if input.Kind != "weekly" || len(input.Weekdays) == 0 || input.StartMinute == nil || input.DurationMinutes == nil {
		return fmt.Errorf("weekly maintenance requires weekdays, start time, and duration")
	}
	for _, day := range input.Weekdays {
		if day < 0 || day > 6 {
			return fmt.Errorf("weekday must be between 0 and 6")
		}
	}
	if *input.StartMinute < 0 || *input.StartMinute > 1439 || *input.DurationMinutes < 15 || *input.DurationMinutes > 1440 {
		return fmt.Errorf("weekly maintenance time or duration is invalid")
	}
	return nil
}
