package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/local/mtn-fibrex/api/internal/store"
)

func (a *api) alertState(w http.ResponseWriter, r *http.Request) {
	readIDs, preferences, err := a.store.AlertState(r.Context(), authenticatedUsername(r))
	if err != nil {
		a.logger.Error("load alert state", "error", err)
		writeJSON(w, 500, map[string]string{"error": "load alert state"})
		return
	}
	writeJSON(w, 200, map[string]any{"readIds": readIDs, "preferences": preferences})
}

func (a *api) setAlertsRead(w http.ResponseWriter, r *http.Request) {
	var body struct {
		AlertKeys []string `json:"alertKeys"`
		Read      bool     `json:"read"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32*1024))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&body); err != nil || len(body.AlertKeys) == 0 || len(body.AlertKeys) > 500 {
		writeJSON(w, 400, map[string]string{"error": "alertKeys must contain between 1 and 500 items"})
		return
	}
	seen := make(map[string]struct{}, len(body.AlertKeys))
	keys := make([]string, 0, len(body.AlertKeys))
	for _, key := range body.AlertKeys {
		key = strings.TrimSpace(key)
		if len(key) < 1 || len(key) > 240 {
			writeJSON(w, 400, map[string]string{"error": "alert key is invalid"})
			return
		}
		if _, exists := seen[key]; !exists {
			seen[key] = struct{}{}
			keys = append(keys, key)
		}
	}
	if err := a.store.SetAlertsRead(r.Context(), authenticatedUsername(r), keys, body.Read); err != nil {
		a.logger.Error("save alert state", "error", err)
		writeJSON(w, 500, map[string]string{"error": "save alert state"})
		return
	}
	writeJSON(w, 200, map[string]any{"updated": len(keys), "read": body.Read})
}

func (a *api) saveNotificationPreferences(w http.ResponseWriter, r *http.Request) {
	var preferences store.NotificationPreferences
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&preferences); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid notification preferences"})
		return
	}
	saved, err := a.store.SaveNotificationPreferences(r.Context(), authenticatedUsername(r), preferences)
	if err != nil {
		a.logger.Error("save notification preferences", "error", err)
		writeJSON(w, 500, map[string]string{"error": "save notification preferences"})
		return
	}
	writeJSON(w, 200, saved)
}
