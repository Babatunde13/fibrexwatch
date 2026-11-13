package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type backupDocument struct {
	SchemaVersion int                        `json:"schemaVersion"`
	GeneratedAt   time.Time                  `json:"generatedAt"`
	Source        string                     `json:"source"`
	Timezone      string                     `json:"timezone"`
	Tables        map[string]json.RawMessage `json:"tables"`
}

func newBackupDocument(now time.Time, source string, tables map[string]json.RawMessage) backupDocument {
	return backupDocument{
		SchemaVersion: 1,
		GeneratedAt:   now,
		Source:        source,
		Timezone:      now.Location().String(),
		Tables:        tables,
	}
}

func backupFilename(now time.Time) string {
	return fmt.Sprintf("fibrex-backup-%s.json", now.Format("2006-01-02-150405"))
}

func (a *api) exportBackup(w http.ResponseWriter, r *http.Request) {
	tables, err := a.store.ExportBackup(r.Context(), a.cfg.RouterAdapter)
	if err != nil {
		a.logger.Error("export local backup", "error", err)
		writeJSON(w, 500, map[string]string{"error": "export local backup"})
		return
	}
	now := time.Now().In(a.cfg.Timezone)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, backupFilename(now)))
	writeJSON(w, 200, newBackupDocument(now, a.cfg.RouterAdapter, tables))
}
