package store

import (
	"testing"
	"time"
)

func TestMaintenanceWindowActiveAt(t *testing.T) {
	location := time.FixedZone("Africa/Lagos", int(time.Hour/time.Second))
	start := time.Date(2026, time.November, 21, 10, 0, 0, 0, location)
	end := start.Add(time.Hour)
	oneOff := MaintenanceWindow{Kind: "one-off", StartsAt: &start, EndsAt: &end}
	if !oneOff.ActiveAt(start.Add(30*time.Minute)) || oneOff.ActiveAt(end) {
		t.Fatal("one-off window did not respect its start/end boundary")
	}

	startMinute, duration := int16(23*60+30), int16(90)
	weekly := MaintenanceWindow{
		Kind: "weekly", Weekdays: []int16{int16(time.Saturday)}, StartMinute: &startMinute,
		DurationMinutes: &duration, Timezone: "Africa/Lagos",
	}
	if !weekly.ActiveAt(time.Date(2026, time.November, 22, 0, 15, 0, 0, location)) {
		t.Fatal("weekly window should remain active when it crosses midnight")
	}
	if weekly.ActiveAt(time.Date(2026, time.November, 22, 2, 0, 0, 0, location)) {
		t.Fatal("weekly window remained active after its duration")
	}
}

func TestValidateMaintenanceInput(t *testing.T) {
	now := time.Now()
	later := now.Add(time.Hour)
	if err := ValidateMaintenanceInput(MaintenanceInput{Kind: "one-off", Label: "Router restart", StartsAt: &now, EndsAt: &later}); err != nil {
		t.Fatalf("valid one-off window rejected: %v", err)
	}
	tooLate := now.Add(8 * 24 * time.Hour)
	if err := ValidateMaintenanceInput(MaintenanceInput{Kind: "one-off", Label: "Too long", StartsAt: &now, EndsAt: &tooLate}); err == nil {
		t.Fatal("expected an overlong one-off window to be rejected")
	}
}
