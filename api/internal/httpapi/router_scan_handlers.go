package httpapi

import "net/http"

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
	scan, err := a.store.LatestRouterScan(r.Context(), a.cfg.RouterAdapter)
	if err != nil {
		a.logger.Error("load router scan", "error", err)
		writeJSON(w, 500, map[string]string{"error": "load router scan"})
		return
	}
	writeJSON(w, 200, map[string]any{"scan": scan})
}
