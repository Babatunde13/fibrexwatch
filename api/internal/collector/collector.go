package collector

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/local/mtn-fibrex/api/internal/router"
	"github.com/local/mtn-fibrex/api/internal/store"
)

type Collector struct {
	logger   *slog.Logger
	store    *store.Store
	adapter  router.Adapter
	source   string
	interval time.Duration
	status   store.WorkerStatus
}

func New(logger *slog.Logger, repository *store.Store, adapter router.Adapter, source string, interval time.Duration) *Collector {
	now := time.Now()
	return &Collector{
		logger: logger, store: repository, adapter: adapter, source: source, interval: interval,
		status: store.WorkerStatus{Source: source, InstanceID: fmt.Sprintf("%s:%d", hostname(), os.Getpid()), StartedAt: now, HeartbeatAt: now},
	}
}

func (c *Collector) Run(ctx context.Context) {
	c.runCollection(ctx)
	next := time.NewTimer(c.interval)
	requests := time.NewTicker(2 * time.Second)
	heartbeat := time.NewTicker(10 * time.Second)
	defer next.Stop()
	defer requests.Stop()
	defer heartbeat.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-next.C:
			delay := c.runCollection(ctx)
			next.Reset(delay)
		case <-requests.C:
			c.runDeviceControl(ctx)
			requestID, err := c.store.PendingCollectionRequest(ctx, c.source)
			if err != nil {
				c.logger.Error("poll collection requests", "error", err)
				continue
			}
			if requestID != 0 {
				collectionErr := c.collect(ctx)
				c.recordResult(ctx, collectionErr)
				if err := c.store.CompleteCollectionRequest(ctx, requestID, collectionErr); err != nil {
					c.logger.Error("complete collection request", "error", err)
				}
			}
		case <-heartbeat.C:
			c.status.HeartbeatAt = time.Now()
			if err := c.store.UpdateWorkerStatus(ctx, c.status); err != nil {
				c.logger.Error("store worker heartbeat", "error", err)
			}
		}
	}
}

func (c *Collector) RunOnce(ctx context.Context) error {
	c.runDeviceControl(ctx)
	err := c.collect(ctx)
	c.recordResult(ctx, err)
	return err
}

func (c *Collector) runDeviceControl(ctx context.Context) {
	request, err := c.store.PendingDeviceControl(ctx)
	if err != nil {
		c.logger.Error("poll device control requests", "error", err)
		return
	}
	if request == nil {
		return
	}
	controlErr := c.adapter.BlockDevice(ctx, router.DeviceBlockRequest{
		MACAddress: request.MACAddress,
		SSIDName:   request.SSIDName,
		DeviceName: request.DeviceName,
	})
	if err := c.store.CompleteDeviceControl(ctx, request.ID, request.DeviceID, controlErr); err != nil {
		c.logger.Error("complete device control request", "requestId", request.ID, "error", err)
		return
	}
	if controlErr != nil {
		c.logger.Error("block router device", "deviceId", request.DeviceID, "error", controlErr)
		return
	}
	c.logger.Info("router device blocked", "deviceId", request.DeviceID, "macAddress", request.MACAddress)
}

func (c *Collector) runCollection(ctx context.Context) time.Duration {
	err := c.collect(ctx)
	c.recordResult(ctx, err)
	if err == nil {
		return c.interval
	}
	delay := 5 * time.Second * time.Duration(1<<min(c.status.ConsecutiveFailures-1, 6))
	if delay > c.interval {
		return c.interval
	}
	return delay
}

func (c *Collector) recordResult(ctx context.Context, collectionErr error) {
	now := time.Now()
	c.status.HeartbeatAt = now
	c.status.LastAttemptAt = &now
	if collectionErr == nil {
		c.status.LastSuccessAt = &now
		c.status.LastError = ""
		c.status.ConsecutiveFailures = 0
	} else {
		c.status.LastError = collectionErr.Error()
		c.status.ConsecutiveFailures++
		c.logger.Error("collect router data", "error", collectionErr, "consecutiveFailures", c.status.ConsecutiveFailures)
		if c.status.ConsecutiveFailures == 1 {
			if err := c.store.RecordCollectorEvent(ctx, "collection_failed", collectionErr.Error()); err != nil {
				c.logger.Error("store collector event", "error", err)
			}
		}
	}
	if err := c.store.UpdateWorkerStatus(ctx, c.status); err != nil {
		c.logger.Error("store worker status", "error", err)
	}
}

func (c *Collector) collect(ctx context.Context) error {
	reading, err := c.adapter.ConnectionCounters(ctx)
	if err != nil {
		return fmt.Errorf("collect router counters: %w", err)
	}
	if err := c.store.RecordConnectionReading(ctx, c.source, reading); err != nil {
		return fmt.Errorf("store router counters: %w", err)
	}
	devices, err := c.adapter.ConnectedDevices(ctx)
	if err != nil && err != router.ErrCapabilityUnsupported {
		return fmt.Errorf("collect connected devices: %w", err)
	} else if err == nil {
		if err := c.store.RecordDevices(ctx, devices, reading.RecordedAt); err != nil {
			return fmt.Errorf("store connected devices: %w", err)
		}
	}
	c.logger.Debug("router counters collected", "recordedAt", reading.RecordedAt)
	return nil
}

func hostname() string {
	name, err := os.Hostname()
	if err != nil || name == "" {
		return "unknown"
	}
	return name
}
