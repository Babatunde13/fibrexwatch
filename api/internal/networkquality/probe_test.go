package networkquality

import (
	"context"
	"net"
	"testing"
)

func TestProbeTCPMeasuresReachableTarget(t *testing.T) {
	prober := New("")
	prober.dialContext = func(context.Context, string, string) (net.Conn, error) {
		client, server := net.Pipe()
		_ = server.Close()
		return client, nil
	}
	latency, loss := prober.probeTCP(context.Background(), "safe.test:443")
	if latency == nil || *latency < 1 {
		t.Fatalf("latency = %v, want a positive measurement", latency)
	}
	if loss != 0 {
		t.Fatalf("loss = %d, want 0", loss)
	}
}

func TestProbeTCPTreatsMissingTargetAsFullLoss(t *testing.T) {
	latency, loss := New("").probeTCP(context.Background(), "")
	if latency != nil || loss != 100 {
		t.Fatalf("latency = %v, loss = %d; want nil, 100", latency, loss)
	}
}
