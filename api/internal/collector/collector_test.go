package collector

import (
	"testing"
	"time"
)

func TestFormatDuration(t *testing.T) {
	tests := []struct {
		name     string
		duration time.Duration
		want     string
	}{
		{name: "seconds", duration: 42 * time.Second, want: "42s"},
		{name: "minutes", duration: 17*time.Minute + 38*time.Second, want: "17m"},
		{name: "hours", duration: 3*time.Hour + 12*time.Minute, want: "3h 12m"},
		{name: "days", duration: 26*time.Hour + 7*time.Minute, want: "1d 2h 7m"},
		{name: "negative", duration: -time.Minute, want: "0s"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := formatDuration(test.duration); got != test.want {
				t.Fatalf("formatDuration(%s) = %q, want %q", test.duration, got, test.want)
			}
		})
	}
}
