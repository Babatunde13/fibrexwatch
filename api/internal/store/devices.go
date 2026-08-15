package store

import (
	"context"
	"fmt"
	"time"

	"github.com/local/mtn-fibrex/api/internal/router"
)

func (s *Store) ListDevices(ctx context.Context, includeArchived bool, sortBy, direction string) ([]DeviceSummary, error) {
	sortExpressions := map[string]string{
		"name":      "coalesce(nullif(d.display_name,''),nullif(d.hostname,''),d.mac_address)",
		"lastSeen":  "d.last_seen_at",
		"firstSeen": "d.first_seen_at",
		"status":    "coalesce(reading.online,false)",
		"ipAddress": "address.ip_address",
		"owner":     "d.owner_name",
		"category":  "d.category",
		"ssid":      "d.current_ssid",
	}
	sortExpression, ok := sortExpressions[sortBy]
	if !ok {
		return nil, fmt.Errorf("unsupported device sort %q", sortBy)
	}
	if direction != "asc" && direction != "desc" {
		return nil, fmt.Errorf("unsupported device sort direction %q", direction)
	}
	query := fmt.Sprintf(`
		select
			d.id,
			d.mac_address,
			coalesce(d.hostname,''),
			coalesce(d.display_name,''),
			coalesce(d.manufacturer,''),
			coalesce(d.owner_name,''),
			coalesce(d.category,''),
			coalesce(host(address.ip_address),''),
			coalesce(d.current_ssid,''),
			coalesce(d.connection_type,''),
			d.first_seen_at,
			d.last_seen_at,
			coalesce(reading.online,false),
			reading.recorded_at,
			d.archived_at,
			d.blocked_at,
			exists(
				select 1
				from device_control_requests control
				where control.device_id=d.id
					and control.action='block'
					and control.completed_at is null
			)
		from devices d
		left join lateral (
			select
				ip_address
			from device_addresses
			where device_id=d.id
			order by last_seen_at desc
			limit 1
		) address on true
		left join lateral (
			select
				online,
				recorded_at
			from device_readings
			where device_id=d.id
			order by recorded_at desc
			limit 1
		) reading on true
		where ($1 or d.archived_at is null)
		order by d.archived_at nulls first,%s %s nulls last,d.id asc`,
		sortExpression, direction)
	rows, err := s.db.Query(ctx, query, includeArchived)
	if err != nil {
		return nil, fmt.Errorf("list devices: %w", err)
	}
	defer rows.Close()
	devices := make([]DeviceSummary, 0)
	for rows.Next() {
		var d DeviceSummary
		if err := rows.Scan(&d.ID, &d.MACAddress, &d.Hostname, &d.DisplayName, &d.Manufacturer, &d.OwnerName, &d.Category, &d.IPAddress, &d.SSIDName, &d.ConnectionType, &d.FirstSeenAt, &d.LastSeenAt, &d.Online, &d.StatusAt, &d.ArchivedAt, &d.BlockedAt, &d.BlockPending); err != nil {
			return nil, fmt.Errorf("scan device: %w", err)
		}
		devices = append(devices, d)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read devices: %w", err)
	}
	return devices, nil
}

func (s *Store) GetDevice(ctx context.Context, id int64) (*DeviceSummary, error) {
	devices, err := s.ListDevices(ctx, true, "name", "asc")
	if err != nil {
		return nil, err
	}
	for i := range devices {
		if devices[i].ID == id {
			return &devices[i], nil
		}
	}
	return nil, nil
}

func (s *Store) DeviceAddresses(ctx context.Context, id int64) ([]DeviceAddress, error) {
	rows, err := s.db.Query(ctx, `
		select
			host(ip_address),
			first_seen_at,
			last_seen_at
		from device_addresses
		where device_id=$1
		order by last_seen_at desc`, id)
	if err != nil {
		return nil, fmt.Errorf("query device addresses: %w", err)
	}
	defer rows.Close()
	items := make([]DeviceAddress, 0)
	for rows.Next() {
		var item DeviceAddress
		if err := rows.Scan(&item.IPAddress, &item.FirstSeenAt, &item.LastSeenAt); err != nil {
			return nil, fmt.Errorf("scan device address: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
func (s *Store) UpdateDeviceMetadata(ctx context.Context, id int64, displayName, ownerName, category string) (bool, error) {
	command, err := s.db.Exec(ctx, `
		update devices
		set display_name=nullif($2,''),
			owner_name=nullif($3,''),
			category=nullif($4,'')
		where id=$1`, id, displayName, ownerName, category)
	if err != nil {
		return false, fmt.Errorf("update device metadata: %w", err)
	}
	return command.RowsAffected() == 1, nil
}

func (s *Store) ArchiveDevice(ctx context.Context, id int64) (bool, error) {
	command, err := s.db.Exec(ctx, `
		update devices
		set archived_at=coalesce(archived_at,now())
		where id=$1`, id)
	if err != nil {
		return false, fmt.Errorf("archive device: %w", err)
	}
	return command.RowsAffected() == 1, nil
}

func (s *Store) RestoreDevice(ctx context.Context, id int64) (bool, error) {
	command, err := s.db.Exec(ctx, `
		update devices
		set archived_at=null
		where id=$1`, id)
	if err != nil {
		return false, fmt.Errorf("restore device: %w", err)
	}
	return command.RowsAffected() == 1, nil
}

func (s *Store) DeleteDevice(ctx context.Context, id int64) (bool, error) {
	command, err := s.db.Exec(ctx, `
		delete from devices
		where id=$1
			and archived_at is not null`, id)
	if err != nil {
		return false, fmt.Errorf("delete device: %w", err)
	}
	return command.RowsAffected() == 1, nil
}
func (s *Store) DeviceHistory(ctx context.Context, id int64, timezone string, start, end time.Time) ([]DeviceHistoryDay, error) {
	rows, err := s.db.Query(ctx, `
		with samples as (
			select
				recorded_at,
				online,
				lag(online,1,false) over (order by recorded_at) as previously_online
			from device_readings
			where device_id=$1
				and recorded_at >= $2
				and recorded_at < $3
		)
		select
			date_trunc('day',recorded_at at time zone $4)::date,
			min(recorded_at),
			max(recorded_at),
			count(*) filter (where online),
			count(*),
			count(*) filter (where online and not previously_online)
		from samples
		group by 1
		order by 1`, id, start, end, timezone)
	if err != nil {
		return nil, fmt.Errorf("query device history: %w", err)
	}
	defer rows.Close()
	items := make([]DeviceHistoryDay, 0)
	for rows.Next() {
		var item DeviceHistoryDay
		if err := rows.Scan(&item.Date, &item.FirstSeenAt, &item.LastSeenAt, &item.OnlineSamples, &item.TotalSamples, &item.OnlineSessions); err != nil {
			return nil, fmt.Errorf("scan device history: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
func (s *Store) RecordDevices(ctx context.Context, devices []router.Device, recordedAt time.Time) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin device transaction: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	if _, err = tx.Exec(ctx, `
		insert into device_readings (device_id,recorded_at,online)
		select id,$1,false from devices
		on conflict (device_id,recorded_at)
		do update set online=false`, recordedAt); err != nil {
		return fmt.Errorf("mark absent devices offline: %w", err)
	}
	for _, device := range devices {
		var id int64
		err := tx.QueryRow(ctx, `
			insert into devices (
				mac_address,hostname,current_ssid,connection_type,first_seen_at,last_seen_at
			) values ($1,nullif($2,''),nullif($3,''),nullif($4,''),$5,$5)
			on conflict (mac_address) do update set
				hostname=coalesce(nullif(excluded.hostname,''),devices.hostname),
				current_ssid=coalesce(nullif(excluded.current_ssid,''),devices.current_ssid),
				connection_type=coalesce(nullif(excluded.connection_type,''),devices.connection_type),
				last_seen_at=excluded.last_seen_at,
				archived_at=null
			returning id`, device.MACAddress, device.Hostname, device.SSIDName, device.ConnectionType, recordedAt).Scan(&id)
		if err != nil {
			return fmt.Errorf("upsert device: %w", err)
		}
		if device.IPAddress != "" {
			if _, err = tx.Exec(ctx, `
				insert into device_addresses (device_id,ip_address,first_seen_at,last_seen_at)
				values ($1,$2,$3,$3)
				on conflict (device_id,ip_address)
				do update set last_seen_at=excluded.last_seen_at`, id, device.IPAddress, recordedAt); err != nil {
				return fmt.Errorf("upsert device address: %w", err)
			}
		}
		if _, err = tx.Exec(ctx, `
			insert into device_readings (device_id,recorded_at,online)
			values ($1,$2,$3)
			on conflict (device_id,recorded_at)
			do update set online=excluded.online`, id, recordedAt, device.Online); err != nil {
			return fmt.Errorf("insert device reading: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit device transaction: %w", err)
	}
	return nil
}
