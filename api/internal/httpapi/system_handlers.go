package httpapi

import (
	"net/http"
	"strconv"
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

func (a *api) collectorEvents(w http.ResponseWriter, r *http.Request) {
	limit := 50
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 200 {
			writeJSON(w, 400, map[string]string{"error": "limit must be between 1 and 200"})
			return
		}
		limit = parsed
	}
	events, err := a.store.ListCollectorEvents(r.Context(), limit)
	if err != nil {
		a.logger.Error("load collector events", "error", err)
		writeJSON(w, 500, map[string]string{"error": "load collector events"})
		return
	}
	writeJSON(w, 200, map[string]any{"events": events})
}

func (a *api) networkQuality(w http.ResponseWriter, r *http.Request) {
	hours := 24
	if raw := r.URL.Query().Get("hours"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 168 {
			writeJSON(w, 400, map[string]string{"error": "hours must be between 1 and 168"})
			return
		}
		hours = parsed
	}
	readings, err := a.store.NetworkQualityHistory(r.Context(), a.cfg.RouterAdapter, time.Now().Add(-time.Duration(hours)*time.Hour))
	if err != nil {
		a.logger.Error("load network quality", "error", err)
		writeJSON(w, 500, map[string]string{"error": "load network quality"})
		return
	}
	writeJSON(w, 200, map[string]any{"hours": hours, "readings": readings})
}
