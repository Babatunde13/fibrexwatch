package httpapi

import (
	"net/http"
	"time"
)

func (a *api) routerCapabilities(w http.ResponseWriter, _ *http.Request) {
	connected := a.cfg.RouterAdapter == "huawei-web"
	writeJSON(w, 200, map[string]any{"adapter": a.cfg.RouterAdapter, "connectionCounters": connected || a.cfg.RouterAdapter == "simulated", "connectedDevices": connected, "deviceBlocking": connected, "perDeviceCounters": false, "perDeviceUsageReason": "The Huawei HG8145X7-10 interface exposes client presence and instantaneous traffic rates, but no persistent per-client byte counters. Accurate per-device totals require a supported gateway such as OpenWrt, OPNsense, or pfSense."})
}
func (a *api) status(w http.ResponseWriter, r *http.Request) {
	configured := a.cfg.RouterAdapter != "none"
	latest, err := a.store.LatestReadingTime(r.Context(), a.cfg.RouterAdapter)
	if err != nil {
		a.logger.Error("load collector status", "error", err)
		writeJSON(w, 500, map[string]string{"error": "load collector status"})
		return
	}
	worker, err := a.store.GetWorkerStatus(r.Context(), a.cfg.RouterAdapter)
	if err != nil {
		a.logger.Error("load worker status", "error", err)
		writeJSON(w, 500, map[string]string{"error": "load worker status"})
		return
	}
	state := "not-configured"
	workerOfflineAfter := max(2*a.cfg.CollectionInterval, 2*time.Minute)
	if configured && (worker == nil || time.Since(worker.HeartbeatAt) > workerOfflineAfter) {
		state = "worker-offline"
	} else if configured && worker.ConsecutiveFailures > 0 {
		state = "error"
	} else if configured && latest == nil {
		state = "awaiting-interface"
	} else if configured && time.Since(*latest) <= 2*a.cfg.CollectionInterval {
		state = "running"
	} else if configured {
		state = "stale"
	}
	writeJSON(w, 200, map[string]any{"routerConfigured": configured, "routerAddress": a.cfg.RouterAddress, "routerAdapter": a.cfg.RouterAdapter, "collectorState": state, "lastCollectedAt": latest, "collectionIntervalSeconds": int(a.cfg.CollectionInterval.Seconds()), "timezone": a.cfg.Timezone.String(), "worker": worker})
}
func (a *api) collectNow(w http.ResponseWriter, r *http.Request) {
	if a.cfg.RouterAdapter == "none" {
		writeJSON(w, 409, map[string]string{"error": "router collection is not configured"})
		return
	}
	id, err := a.store.QueueCollection(r.Context(), a.cfg.RouterAdapter)
	if err != nil {
		a.logger.Error("queue collection", "error", err)
		writeJSON(w, 500, map[string]string{"error": "queue collection"})
		return
	}
	writeJSON(w, 202, map[string]any{"requestId": id, "status": "queued"})
}
