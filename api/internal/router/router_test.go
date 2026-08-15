package router

import (
	"testing"
	"time"
)

func TestCalculateDelta(t *testing.T) {
	tests := []struct {
		name     string
		previous TrafficCounters
		current  TrafficCounters
		want     Delta
	}{
		{
			name:     "normal interval",
			previous: TrafficCounters{DownloadBytes: 100, UploadBytes: 50, UptimeSeconds: 60},
			current:  TrafficCounters{DownloadBytes: 175, UploadBytes: 65, UptimeSeconds: 120},
			want:     Delta{DownloadBytes: 75, UploadBytes: 15},
		},
		{
			name:     "router reset",
			previous: TrafficCounters{DownloadBytes: 1000, UploadBytes: 500, UptimeSeconds: 3600},
			current:  TrafficCounters{DownloadBytes: 25, UploadBytes: 10, UptimeSeconds: 20},
			want:     Delta{DownloadBytes: 25, UploadBytes: 10, Reset: true},
		},
		{
			name:     "duplicate counters",
			previous: TrafficCounters{DownloadBytes: 1000, UploadBytes: 500, UptimeSeconds: 3600},
			current:  TrafficCounters{DownloadBytes: 1000, UploadBytes: 500, UptimeSeconds: 3660},
			want:     Delta{},
		},
		{
			name:     "long collection gap",
			previous: TrafficCounters{DownloadBytes: 1000, UploadBytes: 500, UptimeSeconds: 3600},
			current:  TrafficCounters{DownloadBytes: 1600, UploadBytes: 800, UptimeSeconds: 7200},
			want:     Delta{DownloadBytes: 600, UploadBytes: 300},
		},
		{
			name:     "counter rollover is a reset",
			previous: TrafficCounters{DownloadBytes: ^uint64(0) - 10, UploadBytes: 500, UptimeSeconds: 3600},
			current:  TrafficCounters{DownloadBytes: 20, UploadBytes: 510, UptimeSeconds: 3660},
			want:     Delta{DownloadBytes: 20, UploadBytes: 510, Reset: true},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.previous.RecordedAt = time.Now()
			if tt.name == "long collection gap" {
				tt.current.RecordedAt = tt.previous.RecordedAt.Add(time.Hour)
			} else {
				tt.current.RecordedAt = tt.previous.RecordedAt.Add(time.Minute)
			}
			if got := CalculateDelta(tt.previous, tt.current); got != tt.want {
				t.Fatalf("CalculateDelta() = %+v, want %+v", got, tt.want)
			}
		})
	}
}
