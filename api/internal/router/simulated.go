package router

import (
	"context"
	"time"
)

// SimulatedAdapter provides predictable local traffic while a hardware adapter
// is being developed. Its counters behave like cumulative router counters.
type SimulatedAdapter struct {
	startedAt time.Time
}

func NewSimulatedAdapter() *SimulatedAdapter {
	return &SimulatedAdapter{startedAt: time.Now()}
}

func (s *SimulatedAdapter) Identity(context.Context) (Identity, error) {
	return Identity{Manufacturer: "FibreX Monitor", Model: "Simulator", Firmware: "development"}, nil
}

func (s *SimulatedAdapter) Capabilities(context.Context) (Capabilities, error) {
	return Capabilities{ConnectionCounters: true}, nil
}

func (s *SimulatedAdapter) ConnectionCounters(context.Context) (TrafficCounters, error) {
	elapsed := uint64(time.Since(s.startedAt).Seconds())
	return TrafficCounters{
		RecordedAt:    time.Now(),
		DownloadBytes: elapsed * 2_000_000,
		UploadBytes:   elapsed * 250_000,
		UptimeSeconds: elapsed,
	}, nil
}

func (s *SimulatedAdapter) ConnectedDevices(context.Context) ([]Device, error) {
	return nil, ErrCapabilityUnsupported
}

func (s *SimulatedAdapter) DeviceCounters(context.Context) ([]DeviceTrafficCounters, error) {
	return nil, ErrCapabilityUnsupported
}

func (s *SimulatedAdapter) BlockDevice(context.Context, DeviceBlockRequest) error {
	return ErrCapabilityUnsupported
}
