package store

import "time"

type UsageSummary struct {
	DownloadBytes int64
	UploadBytes   int64
	ReadingCount  int64
	ActiveDevices int64
}
type DailyUsage struct {
	Date          time.Time
	DownloadBytes int64
	UploadBytes   int64
	ReadingCount  int64
}
type UsagePoint struct {
	Period        time.Time
	DownloadBytes int64
	UploadBytes   int64
	ReadingCount  int64
}
type WorkerStatus struct {
	Source              string     `json:"source"`
	InstanceID          string     `json:"instanceId"`
	StartedAt           time.Time  `json:"startedAt"`
	HeartbeatAt         time.Time  `json:"heartbeatAt"`
	LastAttemptAt       *time.Time `json:"lastAttemptAt"`
	LastSuccessAt       *time.Time `json:"lastSuccessAt"`
	LastError           string     `json:"lastError"`
	ConsecutiveFailures int        `json:"consecutiveFailures"`
}
type DeviceSummary struct {
	ID             int64      `json:"id"`
	MACAddress     string     `json:"macAddress"`
	Hostname       string     `json:"hostname"`
	DisplayName    string     `json:"displayName"`
	Manufacturer   string     `json:"manufacturer"`
	OwnerName      string     `json:"ownerName"`
	Category       string     `json:"category"`
	IPAddress      string     `json:"ipAddress"`
	SSIDName       string     `json:"ssidName"`
	ConnectionType string     `json:"connectionType"`
	ConnectionBand string     `json:"connectionBand"`
	FirstSeenAt    time.Time  `json:"firstSeenAt"`
	LastSeenAt     time.Time  `json:"lastSeenAt"`
	Online         bool       `json:"online"`
	StatusAt       *time.Time `json:"statusAt"`
	ArchivedAt     *time.Time `json:"archivedAt"`
	BlockedAt      *time.Time `json:"blockedAt"`
	BlockPending   bool       `json:"blockPending"`
}

type DeviceControlRequest struct {
	ID         int64
	DeviceID   int64
	MACAddress string
	DeviceName string
	SSIDName   string
}
type DeviceHistoryDay struct {
	Date           time.Time `json:"-"`
	FirstSeenAt    time.Time `json:"firstSeenAt"`
	LastSeenAt     time.Time `json:"lastSeenAt"`
	OnlineSamples  int64     `json:"onlineSamples"`
	TotalSamples   int64     `json:"totalSamples"`
	OnlineSessions int64     `json:"onlineSessions"`
}
type DeviceAddress struct {
	IPAddress   string    `json:"ipAddress"`
	FirstSeenAt time.Time `json:"firstSeenAt"`
	LastSeenAt  time.Time `json:"lastSeenAt"`
}
type DataPlan struct {
	AllowanceBytes  int64     `json:"allowanceBytes"`
	BillingDay      int       `json:"billingDay"`
	AlertThresholds []int32   `json:"alertThresholds"`
	UpdatedAt       time.Time `json:"updatedAt"`
}
