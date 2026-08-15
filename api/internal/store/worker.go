package store

import (
	"context"
	"fmt"
)

func (s *Store) UpdateWorkerStatus(ctx context.Context, status WorkerStatus) error {
	_, err := s.db.Exec(ctx, `
		insert into worker_status (
			source,instance_id,started_at,heartbeat_at,last_attempt_at,
			last_success_at,last_error,consecutive_failures
		) values ($1,$2,$3,$4,$5,$6,$7,$8)
		on conflict (source) do update set
			instance_id=excluded.instance_id,
			started_at=excluded.started_at,
			heartbeat_at=excluded.heartbeat_at,
			last_attempt_at=excluded.last_attempt_at,
			last_success_at=excluded.last_success_at,
			last_error=excluded.last_error,
			consecutive_failures=excluded.consecutive_failures`, status.Source, status.InstanceID, status.StartedAt, status.HeartbeatAt, status.LastAttemptAt, status.LastSuccessAt, status.LastError, status.ConsecutiveFailures)
	if err != nil {
		return fmt.Errorf("update worker status: %w", err)
	}
	return nil
}

func (s *Store) GetWorkerStatus(ctx context.Context, source string) (*WorkerStatus, error) {
	var status WorkerStatus
	err := s.db.QueryRow(ctx, `
		select
			source,instance_id,started_at,heartbeat_at,last_attempt_at,
			last_success_at,last_error,consecutive_failures
		from worker_status
		where source=$1`, source).Scan(&status.Source, &status.InstanceID, &status.StartedAt, &status.HeartbeatAt, &status.LastAttemptAt, &status.LastSuccessAt, &status.LastError, &status.ConsecutiveFailures)
	if isNoRows(err) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get worker status: %w", err)
	}
	return &status, nil
}

func (s *Store) QueueCollection(ctx context.Context, source string) (int64, error) {
	var id int64
	err := s.db.QueryRow(ctx, `
		insert into collection_requests (source)
		values ($1)
		returning id`, source).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("queue collection: %w", err)
	}
	return id, nil
}

func (s *Store) PendingCollectionRequest(ctx context.Context, source string) (int64, error) {
	var id int64
	err := s.db.QueryRow(ctx, `
		select id
		from collection_requests
		where source=$1
			and completed_at is null
		order by requested_at
		limit 1`, source).Scan(&id)
	if isNoRows(err) {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("get pending collection request: %w", err)
	}
	return id, nil
}

func (s *Store) CompleteCollectionRequest(ctx context.Context, id int64, collectionErr error) error {
	message := ""
	if collectionErr != nil {
		message = collectionErr.Error()
	}
	_, err := s.db.Exec(ctx, `
		update collection_requests
		set completed_at=now(),
			error=$2
		where id=$1`, id, message)
	if err != nil {
		return fmt.Errorf("complete collection request: %w", err)
	}
	return nil
}

func (s *Store) RecordCollectorEvent(ctx context.Context, eventType, detail string) error {
	_, err := s.db.Exec(ctx, `
		insert into collector_events (event_type,detail)
		values ($1,jsonb_build_object('message',$2::text))`, eventType, detail)
	if err != nil {
		return fmt.Errorf("record collector event: %w", err)
	}
	return nil
}

func (s *Store) QueueDeviceBlock(ctx context.Context, deviceID int64, ssidName string) (int64, error) {
	var id int64
	err := s.db.QueryRow(ctx, `
		insert into device_control_requests (device_id,action,ssid_name)
		select id,'block',$2
		from devices
		where id=$1
			and blocked_at is null
		on conflict (device_id,action) where completed_at is null
		do update set requested_at=excluded.requested_at
		returning id`, deviceID, ssidName).Scan(&id)
	if isNoRows(err) {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("queue device block: %w", err)
	}
	return id, nil
}

func (s *Store) PendingDeviceControl(ctx context.Context) (*DeviceControlRequest, error) {
	var request DeviceControlRequest
	err := s.db.QueryRow(ctx, `
		update device_control_requests control
		set started_at=now()
		from devices device
		where control.id=(
			select id
			from device_control_requests
			where completed_at is null
				and (started_at is null or started_at < now()-interval '30 seconds')
			order by requested_at
			limit 1
			for update skip locked
		)
			and device.id=control.device_id
		returning
			control.id,device.id,device.mac_address,
			coalesce(device.display_name,device.hostname,device.mac_address),
			control.ssid_name`).Scan(&request.ID, &request.DeviceID, &request.MACAddress, &request.DeviceName, &request.SSIDName)
	if isNoRows(err) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("claim device control request: %w", err)
	}
	return &request, nil
}

func (s *Store) CompleteDeviceControl(ctx context.Context, requestID, deviceID int64, controlErr error) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin device control completion: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	message := ""
	if controlErr != nil {
		message = controlErr.Error()
	} else if _, err = tx.Exec(ctx, `
		update devices
		set blocked_at=now()
		where id=$1`, deviceID); err != nil {
		return fmt.Errorf("mark device blocked: %w", err)
	}
	if _, err = tx.Exec(ctx, `
		update device_control_requests
		set completed_at=now(),
			error=nullif($2,'')
		where id=$1`, requestID, message); err != nil {
		return fmt.Errorf("complete device control request: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit device control completion: %w", err)
	}
	return nil
}
