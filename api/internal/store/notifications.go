package store

import (
	"context"
	"time"
)

type NotificationPreferences struct {
	CollectorEnabled bool      `json:"collectorEnabled"`
	DataPlanEnabled  bool      `json:"dataPlanEnabled"`
	DeviceEnabled    bool      `json:"deviceEnabled"`
	ReportEnabled    bool      `json:"reportEnabled"`
	UpdatedAt        time.Time `json:"updatedAt"`
}

func (s *Store) AlertState(ctx context.Context, username string) ([]string, NotificationPreferences, error) {
	preferences, err := s.NotificationPreferences(ctx, username)
	if err != nil {
		return nil, NotificationPreferences{}, err
	}
	rows, err := s.db.Query(ctx, `
		select alert_key from alert_acknowledgements
		where username=$1 order by read_at desc limit 500`, username)
	if err != nil {
		return nil, NotificationPreferences{}, err
	}
	defer rows.Close()
	readIDs := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, NotificationPreferences{}, err
		}
		readIDs = append(readIDs, id)
	}
	return readIDs, preferences, rows.Err()
}

func (s *Store) SetAlertsRead(ctx context.Context, username string, alertKeys []string, read bool) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	for _, key := range alertKeys {
		if read {
			if _, err := tx.Exec(ctx, `
				insert into alert_acknowledgements (username,alert_key) values ($1,$2)
				on conflict (username,alert_key) do update set read_at=now()`, username, key); err != nil {
				return err
			}
		} else if _, err := tx.Exec(ctx, `
			delete from alert_acknowledgements where username=$1 and alert_key=$2`, username, key); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (s *Store) NotificationPreferences(ctx context.Context, username string) (NotificationPreferences, error) {
	var preferences NotificationPreferences
	err := s.db.QueryRow(ctx, `
		select collector_enabled,data_plan_enabled,device_enabled,report_enabled,updated_at
		from notification_preferences where username=$1`, username,
	).Scan(&preferences.CollectorEnabled, &preferences.DataPlanEnabled, &preferences.DeviceEnabled,
		&preferences.ReportEnabled, &preferences.UpdatedAt)
	if isNoRows(err) {
		return NotificationPreferences{
			CollectorEnabled: true,
			DataPlanEnabled:  true,
			DeviceEnabled:    true,
			ReportEnabled:    true,
		}, nil
	}
	return preferences, err
}

func (s *Store) SaveNotificationPreferences(ctx context.Context, username string, preferences NotificationPreferences) (NotificationPreferences, error) {
	err := s.db.QueryRow(ctx, `
		insert into notification_preferences (
			username,collector_enabled,data_plan_enabled,device_enabled,report_enabled,updated_at
		) values ($1,$2,$3,$4,$5,now())
		on conflict (username) do update set
			collector_enabled=excluded.collector_enabled,
			data_plan_enabled=excluded.data_plan_enabled,
			device_enabled=excluded.device_enabled,
			report_enabled=excluded.report_enabled,
			updated_at=now()
		returning updated_at`, username, preferences.CollectorEnabled, preferences.DataPlanEnabled,
		preferences.DeviceEnabled, preferences.ReportEnabled,
	).Scan(&preferences.UpdatedAt)
	return preferences, err
}
