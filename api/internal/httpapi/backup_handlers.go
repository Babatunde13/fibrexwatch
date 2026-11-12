package httpapi

import (
	"fmt"
	"net/http"
	"time"
)

func (a *api) exportBackup(w http.ResponseWriter, r *http.Request) {
	tables, err := a.store.ExportBackup(r.Context(), a.cfg.RouterAdapter)
	if err != nil {
		a.logger.Error("export local backup", "error", err)
		writeJSON(w, 500, map[string]string{"error": "export local backup"})
		return
	}
	now := time.Now().In(a.cfg.Timezone)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="fibrex-backup-%s.json"`, now.Format("2006-01-02-150405")))
	writeJSON(w, 200, map[string]any{
		"schemaVersion": 1,
		"generatedAt":   now,
		"source":        a.cfg.RouterAdapter,
		"timezone":      a.cfg.Timezone.String(),
		"tables":        tables,
	})
}
