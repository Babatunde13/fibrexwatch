package httpapi

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/local/mtn-fibrex/api/internal/store"
)

func (a *api) getDataPlan(w http.ResponseWriter, r *http.Request) {
	plan, err := a.store.GetDataPlan(r.Context())
	if err != nil {
		a.logger.Error("get data plan", "error", err)
		writeJSON(w, 500, map[string]string{"error": "get data plan"})
		return
	}
	writeJSON(w, 200, plan)
}
func (a *api) saveDataPlan(w http.ResponseWriter, r *http.Request) {
	var plan store.DataPlan
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&plan); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid JSON body"})
		return
	}
	if plan.AllowanceBytes < 0 || plan.BillingDay < 1 || plan.BillingDay > 28 {
		writeJSON(w, 400, map[string]string{"error": "allowanceBytes must be non-negative and billingDay must be between 1 and 28"})
		return
	}
	if len(plan.AlertThresholds) == 0 {
		plan.AlertThresholds = []int32{50, 75, 90, 100}
	}
	for _, threshold := range plan.AlertThresholds {
		if threshold < 1 || threshold > 100 {
			writeJSON(w, 400, map[string]string{"error": "alert thresholds must be between 1 and 100"})
			return
		}
	}
	saved, err := a.store.SaveDataPlan(r.Context(), plan)
	if err != nil {
		a.logger.Error("save data plan", "error", err)
		writeJSON(w, 500, map[string]string{"error": "save data plan"})
		return
	}
	writeJSON(w, 200, saved)
}
func (a *api) planUsage(w http.ResponseWriter, r *http.Request) {
	plan, err := a.store.GetDataPlan(r.Context())
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "get data plan usage"})
		return
	}
	now := time.Now().In(a.cfg.Timezone)
	start := time.Date(now.Year(), now.Month(), plan.BillingDay, 0, 0, 0, 0, a.cfg.Timezone)
	if now.Before(start) {
		start = start.AddDate(0, -1, 0)
	}
	end := start.AddDate(0, 1, 0)
	summary, err := a.store.SummarizeUsage(r.Context(), a.cfg.RouterAdapter, start, end)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "summarize data plan usage"})
		return
	}
	used := summary.DownloadBytes + summary.UploadBytes
	remaining := max(plan.AllowanceBytes-used, 0)
	remainingDays := max(int(end.Sub(now).Hours()/24)+1, 1)
	dailyBudget := int64(0)
	if plan.AllowanceBytes > 0 {
		dailyBudget = remaining / int64(remainingDays)
	}
	elapsed := now.Sub(start).Seconds() / end.Sub(start).Seconds()
	projected := int64(0)
	exhaustion := ""
	if elapsed > 0 {
		projected = int64(float64(used) / elapsed)
		if plan.AllowanceBytes > 0 && projected > plan.AllowanceBytes {
			exhaustion = start.Add(time.Duration(float64(end.Sub(start)) * float64(plan.AllowanceBytes) / float64(projected))).Format(time.DateOnly)
		}
	}
	percentage := float64(0)
	if plan.AllowanceBytes > 0 {
		percentage = float64(used) * 100 / float64(plan.AllowanceBytes)
	}
	writeJSON(w, 200, map[string]any{"configured": plan.AllowanceBytes > 0, "cycleStart": start.Format(time.DateOnly), "cycleEnd": end.AddDate(0, 0, -1).Format(time.DateOnly), "allowanceBytes": plan.AllowanceBytes, "usedBytes": used, "remainingBytes": remaining, "dailyBudgetBytes": dailyBudget, "projectedBytes": projected, "projectedExhaustionDate": exhaustion, "usedPercentage": percentage, "remainingDays": remainingDays, "alertThresholds": plan.AlertThresholds})
}
