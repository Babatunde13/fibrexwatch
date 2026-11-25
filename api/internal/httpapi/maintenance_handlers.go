package httpapi

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/local/mtn-fibrex/api/internal/store"
)

type maintenanceRequest struct {
	Kind            string     `json:"kind"`
	Label           string     `json:"label"`
	StartsAt        *time.Time `json:"startsAt"`
	EndsAt          *time.Time `json:"endsAt"`
	Weekdays        []int16    `json:"weekdays"`
	StartMinute     *int16     `json:"startMinute"`
	DurationMinutes *int16     `json:"durationMinutes"`
}

func (a *api) maintenanceState(r *http.Request) ([]store.MaintenanceWindow, *store.MaintenanceWindow, error) {
	windows, err := a.store.ListMaintenanceWindows(r.Context(), a.cfg.RouterAdapter, 50)
	if err != nil {
		return nil, nil, err
	}
	return windows, store.ActiveMaintenance(windows, time.Now()), nil
}

func (a *api) listMaintenance(w http.ResponseWriter, r *http.Request) {
	windows, active, err := a.maintenanceState(r)
	if err != nil {
		a.logger.Error("list maintenance windows", "error", err)
		writeJSON(w, 500, map[string]string{"error": "list maintenance windows"})
		return
	}
	writeJSON(w, 200, map[string]any{"active": active, "windows": windows})
}

func (a *api) createMaintenance(w http.ResponseWriter, r *http.Request) {
	var body maintenanceRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&body); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid maintenance request"})
		return
	}
	input := store.MaintenanceInput{
		Source: a.cfg.RouterAdapter, Kind: body.Kind, Label: strings.TrimSpace(body.Label),
		StartsAt: body.StartsAt, EndsAt: body.EndsAt, Weekdays: body.Weekdays,
		StartMinute: body.StartMinute, DurationMinutes: body.DurationMinutes,
		Timezone: a.cfg.Timezone.String(), CreatedBy: authenticatedUsername(r),
	}
	if err := store.ValidateMaintenanceInput(input); err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	window, err := a.store.CreateMaintenanceWindow(r.Context(), input)
	if err != nil {
		a.logger.Error("create maintenance window", "error", err)
		writeJSON(w, 500, map[string]string{"error": "create maintenance window"})
		return
	}
	writeJSON(w, 201, window)
}

func (a *api) cancelMaintenance(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id < 1 {
		writeJSON(w, 400, map[string]string{"error": "invalid maintenance window id"})
		return
	}
	cancelled, err := a.store.CancelMaintenanceWindow(r.Context(), a.cfg.RouterAdapter, id, authenticatedUsername(r))
	if err != nil {
		a.logger.Error("cancel maintenance window", "error", err)
		writeJSON(w, 500, map[string]string{"error": "cancel maintenance window"})
		return
	}
	if !cancelled {
		writeJSON(w, 404, map[string]string{"error": "active maintenance window not found"})
		return
	}
	writeJSON(w, 200, map[string]bool{"cancelled": true})
}
