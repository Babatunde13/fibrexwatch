package store

import (
	"context"
	"encoding/json"
	"fmt"
)

type backupQuery struct {
	name  string
	query string
	args  []any
}

func backupQueries(source string) []backupQuery {
	return []backupQuery{
		{"routerReadings", `select coalesce(jsonb_agg(to_jsonb(export_row) order by recorded_at),'[]'::jsonb) from (select id,recorded_at,download_total_bytes,upload_total_bytes,router_uptime_seconds,collection_status,source from router_readings where source=$1) export_row`, []any{source}},
		{"usageIntervals", `select coalesce(jsonb_agg(to_jsonb(export_row) order by ended_at),'[]'::jsonb) from (select id,device_id,started_at,ended_at,download_bytes,upload_bytes,estimated,source from usage_intervals where source=$1) export_row`, []any{source}},
		{"devices", `select coalesce(jsonb_agg(to_jsonb(export_row) order by id),'[]'::jsonb) from (select id,mac_address,hostname,display_name,manufacturer,owner_name,category,first_seen_at,last_seen_at,archived_at,blocked_at,current_ssid,connection_type from devices) export_row`, nil},
		{"deviceAddresses", `select coalesce(jsonb_agg(to_jsonb(export_row) order by id),'[]'::jsonb) from (select id,device_id,host(ip_address) as ip_address,first_seen_at,last_seen_at from device_addresses) export_row`, nil},
		{"deviceReadings", `select coalesce(jsonb_agg(to_jsonb(export_row) order by recorded_at),'[]'::jsonb) from (select id,device_id,recorded_at,download_total_bytes,upload_total_bytes,online from device_readings) export_row`, nil},
		{"collectorEvents", `select coalesce(jsonb_agg(to_jsonb(export_row) order by occurred_at),'[]'::jsonb) from (select id,occurred_at,event_type,detail from collector_events) export_row`, nil},
		{"dataPlanSettings", `select coalesce(jsonb_agg(to_jsonb(export_row)),'[]'::jsonb) from (select allowance_bytes,billing_day,alert_thresholds,updated_at from data_plan_settings where id=1) export_row`, nil},
		{"reportScheduleSettings", `select coalesce(jsonb_agg(to_jsonb(export_row)),'[]'::jsonb) from (select frequency,weekday,month_day,updated_at from report_schedule_settings where id=1) export_row`, nil},
		{"generatedReports", `select coalesce(jsonb_agg(to_jsonb(export_row) order by period_end),'[]'::jsonb) from (select id,source,frequency,period_start,period_end,download_bytes,upload_bytes,reading_count,report_data,generated_at from generated_reports where source=$1) export_row`, []any{source}},
		{"networkQualityReadings", `select coalesce(jsonb_agg(to_jsonb(export_row) order by recorded_at),'[]'::jsonb) from (select id,source,recorded_at,gateway_reachable,gateway_latency_ms,gateway_loss_percent,internet_reachable,internet_latency_ms,internet_loss_percent,dns_reachable,dns_latency_ms from network_quality_readings where source=$1) export_row`, []any{source}},
	}
}

// ExportBackup returns user-owned operational data only. Authentication,
// sessions, router credentials, and pending control requests are excluded.
func (s *Store) ExportBackup(ctx context.Context, source string) (map[string]json.RawMessage, error) {
	queries := backupQueries(source)
	result := make(map[string]json.RawMessage, len(queries))
	for _, item := range queries {
		var encoded []byte
		if err := s.db.QueryRow(ctx, item.query, item.args...).Scan(&encoded); err != nil {
			return nil, fmt.Errorf("export backup %s: %w", item.name, err)
		}
		result[item.name] = encoded
	}
	return result, nil
}
