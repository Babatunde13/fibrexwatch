package networkquality

import "fmt"

const (
	highInternetLatencyMS = 200
	highPacketLossPercent = 50
)

type Event struct {
	Type    string
	Message string
}

func Evaluate(previous *Reading, current Reading) []Event {
	previousIssue := issue(previous)
	currentIssue := issue(&current)
	if previousIssue == currentIssue {
		return nil
	}
	if currentIssue == "" {
		return []Event{{
			Type:    "network_quality_recovered",
			Message: "Gateway, internet, and DNS quality checks returned to normal.",
		}}
	}
	return []Event{eventForIssue(currentIssue, current)}
}

func issue(reading *Reading) string {
	if reading == nil {
		return ""
	}
	if !reading.GatewayReachable {
		return "gateway"
	}
	if !reading.InternetReachable {
		return "internet"
	}
	if !reading.DNSReachable {
		return "dns"
	}
	if reading.InternetLossPercent >= highPacketLossPercent {
		return "packet-loss"
	}
	if reading.InternetLatencyMS != nil && *reading.InternetLatencyMS >= highInternetLatencyMS {
		return "latency"
	}
	return ""
}

func eventForIssue(issue string, reading Reading) Event {
	switch issue {
	case "gateway":
		return Event{Type: "gateway_unreachable", Message: "The router gateway did not accept any of 3 bounded connection checks; the issue is likely inside the local network."}
	case "internet":
		return Event{Type: "internet_unreachable", Message: "The gateway responded, but the fixed internet target did not accept any of 3 checks; the upstream connection may be unavailable."}
	case "dns":
		return Event{Type: "dns_resolution_failed", Message: "Internet connectivity responded, but the system DNS resolver could not resolve the fixed check hostname."}
	case "packet-loss":
		return Event{Type: "internet_packet_loss", Message: fmt.Sprintf("Internet checks reported %d%% sample loss across 3 attempts.", reading.InternetLossPercent)}
	case "latency":
		return Event{Type: "internet_latency_high", Message: fmt.Sprintf("Average internet connection latency reached %d ms, above the %d ms alert threshold.", *reading.InternetLatencyMS, highInternetLatencyMS)}
	default:
		return Event{}
	}
}
