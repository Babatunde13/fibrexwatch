package main

import "testing"

func TestGatewayTarget(t *testing.T) {
	tests := map[string]string{
		"https://192.168.100.1:80": "192.168.100.1:80",
		"https://router.local":     "router.local:443",
		"http://router.local":      "router.local:80",
		"":                         "",
	}
	for address, want := range tests {
		if got := gatewayTarget(address); got != want {
			t.Errorf("gatewayTarget(%q) = %q, want %q", address, got, want)
		}
	}
}
