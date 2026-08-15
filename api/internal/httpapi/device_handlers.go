package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func (a *api) devices(w http.ResponseWriter, r *http.Request) {
	includeArchived := r.URL.Query().Get("includeArchived") == "true"
	sortBy := r.URL.Query().Get("sort")
	if sortBy == "" {
		sortBy = "name"
	}
	direction := r.URL.Query().Get("direction")
	if direction == "" {
		direction = "asc"
	}
	devices, err := a.store.ListDevices(r.Context(), includeArchived, sortBy, direction)
	if err != nil {
		if strings.Contains(err.Error(), "unsupported device sort") {
			writeJSON(w, 400, map[string]string{"error": err.Error()})
			return
		}
		a.logger.Error("list devices", "error", err)
		writeJSON(w, 500, map[string]string{"error": "list devices"})
		return
	}
	for index := range devices {
		devices[index].ConnectionBand = a.cfg.ConnectionBand(devices[index].SSIDName, devices[index].ConnectionType)
	}
	writeJSON(w, 200, map[string]any{"devices": devices})
}

func (a *api) archiveDevice(w http.ResponseWriter, r *http.Request) {
	a.changeDeviceLifecycle(w, r, "archive", a.store.ArchiveDevice)
}

func (a *api) restoreDevice(w http.ResponseWriter, r *http.Request) {
	a.changeDeviceLifecycle(w, r, "restore", a.store.RestoreDevice)
}

func (a *api) deleteDevice(w http.ResponseWriter, r *http.Request) {
	a.changeDeviceLifecycle(w, r, "permanently delete", a.store.DeleteDevice)
}

func (a *api) blockDevice(w http.ResponseWriter, r *http.Request) {
	if a.cfg.RouterAdapter != "huawei-web" {
		writeJSON(w, 409, map[string]string{"error": "device blocking is unavailable for this router adapter"})
		return
	}
	id, err := deviceID(r)
	if err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	device, err := a.store.GetDevice(r.Context(), id)
	if err != nil {
		a.logger.Error("load device for block", "deviceId", id, "error", err)
		writeJSON(w, 500, map[string]string{"error": "load device for block"})
		return
	}
	if device == nil {
		writeJSON(w, 404, map[string]string{"error": "device not found"})
		return
	}
	requestID, err := a.store.QueueDeviceBlock(r.Context(), id, a.cfg.FilterSSIDName(device.SSIDName))
	if err != nil {
		a.logger.Error("queue device block", "deviceId", id, "error", err)
		writeJSON(w, 500, map[string]string{"error": "queue device block"})
		return
	}
	if requestID == 0 {
		writeJSON(w, 404, map[string]string{"error": "device not found or already blocked"})
		return
	}
	writeJSON(w, 202, map[string]any{"requestId": requestID, "status": "queued"})
}

func (a *api) changeDeviceLifecycle(w http.ResponseWriter, r *http.Request, action string, change func(context.Context, int64) (bool, error)) {
	id, err := deviceID(r)
	if err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	changed, err := change(r.Context(), id)
	if err != nil {
		a.logger.Error(action+" device", "deviceId", id, "error", err)
		writeJSON(w, 500, map[string]string{"error": action + " device"})
		return
	}
	if !changed {
		writeJSON(w, 404, map[string]string{"error": "device not found or must be archived first"})
		return
	}
	writeJSON(w, 200, map[string]any{"id": id, "status": "ok"})
}

func deviceID(r *http.Request) (int64, error) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		return 0, fmt.Errorf("invalid device id")
	}
	return id, nil
}

func (a *api) device(w http.ResponseWriter, r *http.Request) {
	id, err := deviceID(r)
	if err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	device, err := a.store.GetDevice(r.Context(), id)
	if err != nil {
		a.logger.Error("get device", "error", err)
		writeJSON(w, 500, map[string]string{"error": "get device"})
		return
	}
	if device == nil {
		writeJSON(w, 404, map[string]string{"error": "device not found"})
		return
	}
	device.ConnectionBand = a.cfg.ConnectionBand(device.SSIDName, device.ConnectionType)
	addresses, err := a.store.DeviceAddresses(r.Context(), id)
	if err != nil {
		a.logger.Error("get device addresses", "error", err)
		writeJSON(w, 500, map[string]string{"error": "get device addresses"})
		return
	}
	writeJSON(w, 200, map[string]any{"device": device, "addresses": addresses})
}

func (a *api) updateDevice(w http.ResponseWriter, r *http.Request) {
	id, err := deviceID(r)
	if err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	var body struct {
		DisplayName string `json:"displayName"`
		OwnerName   string `json:"ownerName"`
		Category    string `json:"category"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&body); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid JSON body"})
		return
	}
	body.DisplayName, body.OwnerName, body.Category = strings.TrimSpace(body.DisplayName), strings.TrimSpace(body.OwnerName), strings.TrimSpace(body.Category)
	if len([]rune(body.DisplayName)) > 100 || len([]rune(body.OwnerName)) > 100 || len([]rune(body.Category)) > 50 {
		writeJSON(w, 400, map[string]string{"error": "device metadata is too long"})
		return
	}
	updated, err := a.store.UpdateDeviceMetadata(r.Context(), id, body.DisplayName, body.OwnerName, body.Category)
	if err != nil {
		a.logger.Error("update device", "error", err)
		writeJSON(w, 500, map[string]string{"error": "update device"})
		return
	}
	if !updated {
		writeJSON(w, 404, map[string]string{"error": "device not found"})
		return
	}
	writeJSON(w, 200, map[string]any{"id": id, "displayName": body.DisplayName, "ownerName": body.OwnerName, "category": body.Category})
}

func (a *api) deviceHistory(w http.ResponseWriter, r *http.Request) {
	id, err := deviceID(r)
	if err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	from, to, err := parseDateRange(r, a.cfg.Timezone)
	if err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	history, err := a.store.DeviceHistory(r.Context(), id, a.cfg.Timezone.String(), from, to.AddDate(0, 0, 1))
	if err != nil {
		a.logger.Error("load device history", "error", err)
		writeJSON(w, 500, map[string]string{"error": "load device history"})
		return
	}
	type day struct {
		Date                   string `json:"date"`
		FirstSeenAt            string `json:"firstSeenAt"`
		LastSeenAt             string `json:"lastSeenAt"`
		OnlineSamples          int64  `json:"onlineSamples"`
		TotalSamples           int64  `json:"totalSamples"`
		OnlineSessions         int64  `json:"onlineSessions"`
		EstimatedOnlineSeconds int64  `json:"estimatedOnlineSeconds"`
	}
	days := make([]day, 0, len(history))
	for _, item := range history {
		days = append(days, day{item.Date.Format(time.DateOnly), item.FirstSeenAt.Format(time.RFC3339), item.LastSeenAt.Format(time.RFC3339), item.OnlineSamples, item.TotalSamples, item.OnlineSessions, item.OnlineSamples * int64(a.cfg.CollectionInterval.Seconds())})
	}
	writeJSON(w, 200, map[string]any{"deviceId": id, "from": from.Format(time.DateOnly), "to": to.Format(time.DateOnly), "days": days})
}
