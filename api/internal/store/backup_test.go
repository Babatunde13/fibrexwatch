package store

import (
	"slices"
	"strings"
	"testing"
)

func TestBackupQueriesUseExplicitSafeAllowlist(t *testing.T) {
	want := []string{
		"routerReadings", "usageIntervals", "devices", "deviceAddresses",
		"deviceReadings", "collectorEvents", "dataPlanSettings",
		"reportScheduleSettings", "generatedReports",
	}
	queries := backupQueries("router-source")
	got := make([]string, 0, len(queries))
	for _, item := range queries {
		got = append(got, item.name)
	}
	if !slices.Equal(got, want) {
		t.Fatalf("backup tables = %v, want %v", got, want)
	}

	forbidden := []string{
		"users", "password", "credential", "session", "router_scan",
		"control_request", "worker_state",
	}
	for _, item := range queries {
		query := strings.ToLower(item.query)
		for _, secret := range forbidden {
			if strings.Contains(query, secret) {
				t.Errorf("backup query %q contains forbidden data source %q", item.name, secret)
			}
		}
	}
}
