package router

import (
	"context"
	"errors"
	"time"
)

var ErrCapabilityUnsupported = errors.New("router capability is unsupported")

type Capabilities struct {
	ConnectionCounters bool `json:"connectionCounters"`
	ConnectedDevices   bool `json:"connectedDevices"`
	DeviceCounters     bool `json:"deviceCounters"`
	DeviceBlocking     bool `json:"deviceBlocking"`
}

type Identity struct {
	Manufacturer string `json:"manufacturer"`
	Model        string `json:"model"`
	Firmware     string `json:"firmware"`
}

type TrafficCounters struct {
	RecordedAt    time.Time `json:"recordedAt"`
	DownloadBytes uint64    `json:"downloadBytes"`
	UploadBytes   uint64    `json:"uploadBytes"`
	UptimeSeconds uint64    `json:"uptimeSeconds"`
}

type Device struct {
	MACAddress     string    `json:"macAddress"`
	IPAddress      string    `json:"ipAddress"`
	Hostname       string    `json:"hostname"`
	SSIDName       string    `json:"ssidName"`
	ConnectionType string    `json:"connectionType"`
	Online         bool      `json:"online"`
	LastSeen       time.Time `json:"lastSeen"`
}

type DeviceTrafficCounters struct {
	MACAddress    string    `json:"macAddress"`
	RecordedAt    time.Time `json:"recordedAt"`
	DownloadBytes uint64    `json:"downloadBytes"`
	UploadBytes   uint64    `json:"uploadBytes"`
}

type DeviceBlockRequest struct {
	MACAddress string
	SSIDName   string
	DeviceName string
}

type Adapter interface {
	Identity(context.Context) (Identity, error)
	Capabilities(context.Context) (Capabilities, error)
	ConnectionCounters(context.Context) (TrafficCounters, error)
	ConnectedDevices(context.Context) ([]Device, error)
	DeviceCounters(context.Context) ([]DeviceTrafficCounters, error)
	BlockDevice(context.Context, DeviceBlockRequest) error
}

type Delta struct {
	DownloadBytes uint64
	UploadBytes   uint64
	Reset         bool
}

// CalculateDelta converts two cumulative readings into interval usage. A lower
// counter or uptime indicates that the router restarted or reset its counters.
func CalculateDelta(previous, current TrafficCounters) Delta {
	reset := current.UptimeSeconds < previous.UptimeSeconds ||
		current.DownloadBytes < previous.DownloadBytes ||
		current.UploadBytes < previous.UploadBytes
	if reset {
		return Delta{DownloadBytes: current.DownloadBytes, UploadBytes: current.UploadBytes, Reset: true}
	}
	return Delta{
		DownloadBytes: current.DownloadBytes - previous.DownloadBytes,
		UploadBytes:   current.UploadBytes - previous.UploadBytes,
	}
}
