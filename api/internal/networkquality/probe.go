package networkquality

import (
	"context"
	"net"
	"time"
)

const (
	internetTarget = "1.1.1.1:443"
	dnsTarget      = "one.one.one.one"
	probeAttempts  = 3
	probeTimeout   = 1500 * time.Millisecond
)

type Reading struct {
	RecordedAt          time.Time
	GatewayReachable    bool
	GatewayLatencyMS    *int
	GatewayLossPercent  int
	InternetReachable   bool
	InternetLatencyMS   *int
	InternetLossPercent int
	DNSReachable        bool
	DNSLatencyMS        *int
}

type Prober struct {
	gatewayTarget string
	dialContext   func(context.Context, string, string) (net.Conn, error)
	resolver      *net.Resolver
}

func New(gatewayTarget string) *Prober {
	dialer := &net.Dialer{}
	return &Prober{
		gatewayTarget: gatewayTarget,
		dialContext:   dialer.DialContext,
		resolver:      net.DefaultResolver,
	}
}

func (p *Prober) Probe(ctx context.Context) Reading {
	gatewayLatency, gatewayLoss := p.probeTCP(ctx, p.gatewayTarget)
	internetLatency, internetLoss := p.probeTCP(ctx, internetTarget)
	dnsLatency := p.probeDNS(ctx)
	return Reading{
		RecordedAt:          time.Now(),
		GatewayReachable:    gatewayLatency != nil,
		GatewayLatencyMS:    gatewayLatency,
		GatewayLossPercent:  gatewayLoss,
		InternetReachable:   internetLatency != nil,
		InternetLatencyMS:   internetLatency,
		InternetLossPercent: internetLoss,
		DNSReachable:        dnsLatency != nil,
		DNSLatencyMS:        dnsLatency,
	}
}

func (p *Prober) probeTCP(ctx context.Context, target string) (*int, int) {
	if target == "" {
		return nil, 100
	}
	var total time.Duration
	successes := 0
	for range probeAttempts {
		attemptContext, cancel := context.WithTimeout(ctx, probeTimeout)
		started := time.Now()
		connection, err := p.dialContext(attemptContext, "tcp", target)
		elapsed := time.Since(started)
		cancel()
		if err != nil {
			continue
		}
		_ = connection.Close()
		total += elapsed
		successes++
	}
	if successes == 0 {
		return nil, 100
	}
	latency := max(1, int((total / time.Duration(successes)).Milliseconds()))
	return &latency, (probeAttempts - successes) * 100 / probeAttempts
}

func (p *Prober) probeDNS(ctx context.Context) *int {
	attemptContext, cancel := context.WithTimeout(ctx, probeTimeout)
	defer cancel()
	started := time.Now()
	if _, err := p.resolver.LookupHost(attemptContext, dnsTarget); err != nil {
		return nil
	}
	latency := max(1, int(time.Since(started).Milliseconds()))
	return &latency
}
