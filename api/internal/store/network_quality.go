package store

import (
	"context"
	"time"

	"github.com/local/mtn-fibrex/api/internal/networkquality"
)

type NetworkQualityReading struct {
	ID                  int64     `json:"id"`
	RecordedAt          time.Time `json:"recordedAt"`
	GatewayReachable    bool      `json:"gatewayReachable"`
	GatewayLatencyMS    *int      `json:"gatewayLatencyMs"`
	GatewayLossPercent  int       `json:"gatewayLossPercent"`
	InternetReachable   bool      `json:"internetReachable"`
	InternetLatencyMS   *int      `json:"internetLatencyMs"`
	InternetLossPercent int       `json:"internetLossPercent"`
	DNSReachable        bool      `json:"dnsReachable"`
	DNSLatencyMS        *int      `json:"dnsLatencyMs"`
}

func (s *Store) RecordNetworkQuality(ctx context.Context, source string, reading networkquality.Reading) error {
	_, err := s.db.Exec(ctx, `
		insert into network_quality_readings (
			source,recorded_at,gateway_reachable,gateway_latency_ms,gateway_loss_percent,
			internet_reachable,internet_latency_ms,internet_loss_percent,dns_reachable,dns_latency_ms
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		source, reading.RecordedAt, reading.GatewayReachable, reading.GatewayLatencyMS,
		reading.GatewayLossPercent, reading.InternetReachable, reading.InternetLatencyMS,
		reading.InternetLossPercent, reading.DNSReachable, reading.DNSLatencyMS)
	return err
}

func (s *Store) NetworkQualityHistory(ctx context.Context, source string, since time.Time) ([]NetworkQualityReading, error) {
	rows, err := s.db.Query(ctx, `
		select id,recorded_at,gateway_reachable,gateway_latency_ms,gateway_loss_percent,
			internet_reachable,internet_latency_ms,internet_loss_percent,dns_reachable,dns_latency_ms
		from network_quality_readings
		where source=$1 and recorded_at >= $2
		order by recorded_at`, source, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	readings := []NetworkQualityReading{}
	for rows.Next() {
		var reading NetworkQualityReading
		if err := rows.Scan(&reading.ID, &reading.RecordedAt, &reading.GatewayReachable,
			&reading.GatewayLatencyMS, &reading.GatewayLossPercent, &reading.InternetReachable,
			&reading.InternetLatencyMS, &reading.InternetLossPercent, &reading.DNSReachable,
			&reading.DNSLatencyMS); err != nil {
			return nil, err
		}
		readings = append(readings, reading)
	}
	return readings, rows.Err()
}
