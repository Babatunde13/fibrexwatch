package networkquality

import "testing"

func TestEvaluateQualityTransitions(t *testing.T) {
	fast := 20
	slow := 250
	healthy := Reading{GatewayReachable: true, InternetReachable: true, DNSReachable: true, InternetLatencyMS: &fast}
	tests := []struct {
		name     string
		previous *Reading
		current  Reading
		want     string
	}{
		{name: "no duplicate healthy event", previous: &healthy, current: healthy},
		{name: "gateway failure", previous: &healthy, current: Reading{}, want: "gateway_unreachable"},
		{name: "upstream failure", previous: &healthy, current: Reading{GatewayReachable: true}, want: "internet_unreachable"},
		{name: "DNS failure", previous: &healthy, current: Reading{GatewayReachable: true, InternetReachable: true}, want: "dns_resolution_failed"},
		{name: "packet loss", previous: &healthy, current: Reading{GatewayReachable: true, InternetReachable: true, DNSReachable: true, InternetLatencyMS: &fast, InternetLossPercent: 66}, want: "internet_packet_loss"},
		{name: "high latency", previous: &healthy, current: Reading{GatewayReachable: true, InternetReachable: true, DNSReachable: true, InternetLatencyMS: &slow}, want: "internet_latency_high"},
		{name: "recovery", previous: &Reading{}, current: healthy, want: "network_quality_recovered"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			events := Evaluate(test.previous, test.current)
			if test.want == "" {
				if len(events) != 0 {
					t.Fatalf("events = %+v, want none", events)
				}
				return
			}
			if len(events) != 1 || events[0].Type != test.want {
				t.Fatalf("events = %+v, want %s", events, test.want)
			}
		})
	}
}

func TestEvaluateDoesNotRepeatSameIssue(t *testing.T) {
	previous := Reading{}
	if events := Evaluate(&previous, Reading{}); len(events) != 0 {
		t.Fatalf("events = %+v, want no repeated gateway alert", events)
	}
}
