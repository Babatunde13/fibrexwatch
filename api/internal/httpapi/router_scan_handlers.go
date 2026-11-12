package httpapi

import (
	"net/http"
	"strconv"
)

func (a *api) queueRouterScan(w http.ResponseWriter, r *http.Request) {
	if a.cfg.RouterAdapter != "huawei-web" {
		writeJSON(w, 409, map[string]string{"error": "router inspection is not supported by this adapter"})
		return
	}
	id, err := a.store.QueueRouterScan(r.Context(), a.cfg.RouterAdapter)
	if err != nil {
		a.logger.Error("queue router scan", "error", err)
		writeJSON(w, 500, map[string]string{"error": "queue router scan"})
		return
	}
	writeJSON(w, 202, map[string]any{"requestId": id, "status": "queued"})
}

func (a *api) latestRouterScan(w http.ResponseWriter, r *http.Request) {
	limit := 10
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 20 {
			writeJSON(w, 400, map[string]string{"error": "limit must be between 1 and 20"})
			return
		}
		limit = parsed
	}
	scans, err := a.store.ListRouterScans(r.Context(), a.cfg.RouterAdapter, limit)
	if err != nil {
		a.logger.Error("load router scans", "error", err)
		writeJSON(w, 500, map[string]string{"error": "load router scans"})
		return
	}
	var latest any
	if len(scans) > 0 {
		latest = scans[0]
	}
	writeJSON(w, 200, map[string]any{"scan": latest, "history": scans})
}
