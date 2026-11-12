package httpapi

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/local/mtn-fibrex/api/internal/store"
)

func (a *api) generatedReports(w http.ResponseWriter, r *http.Request) {
	reports, err := a.store.ListGeneratedReports(r.Context(), a.cfg.RouterAdapter, 24)
	if err != nil {
		a.logger.Error("list generated reports", "error", err)
		writeJSON(w, 500, map[string]string{"error": "list generated reports"})
		return
	}
	items := make([]map[string]any, 0, len(reports))
	for _, report := range reports {
		items = append(items, reportResponse(report))
	}
	writeJSON(w, 200, map[string]any{"reports": items})
}

func (a *api) generatedReport(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id < 1 {
		writeJSON(w, 400, map[string]string{"error": "invalid report id"})
		return
	}
	report, err := a.store.GetGeneratedReport(r.Context(), a.cfg.RouterAdapter, id)
	if err != nil {
		a.logger.Error("get generated report", "error", err)
		writeJSON(w, 500, map[string]string{"error": "get generated report"})
		return
	}
	if report == nil {
		writeJSON(w, 404, map[string]string{"error": "report not found"})
		return
	}
	filename := fmt.Sprintf("fibrex-%s-report-%s-%s", report.Frequency, report.PeriodStart.Format(time.DateOnly), report.PeriodEnd.Format(time.DateOnly))
	if r.URL.Query().Get("format") == "csv" {
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.csv"`, filename))
		writer := csv.NewWriter(w)
		_ = writer.Write([]string{"date", "download_bytes", "upload_bytes", "total_bytes", "reading_count"})
		for _, day := range report.Days {
			_ = writer.Write([]string{day.Date, strconv.FormatInt(day.DownloadBytes, 10), strconv.FormatInt(day.UploadBytes, 10), strconv.FormatInt(day.TotalBytes, 10), strconv.FormatInt(day.ReadingCount, 10)})
		}
		writer.Flush()
		return
	}
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.json"`, filename))
	response := reportResponse(*report)
	response["days"] = report.Days
	writeJSON(w, 200, response)
}

func reportResponse(report store.GeneratedReport) map[string]any {
	return map[string]any{
		"id": report.ID, "frequency": report.Frequency,
		"periodStart": report.PeriodStart.Format(time.DateOnly), "periodEnd": report.PeriodEnd.Format(time.DateOnly),
		"downloadBytes": report.DownloadBytes, "uploadBytes": report.UploadBytes,
		"totalBytes": report.DownloadBytes + report.UploadBytes, "readingCount": report.ReadingCount,
		"generatedAt": report.GeneratedAt,
	}
}

func (a *api) getReportSchedule(w http.ResponseWriter, r *http.Request) {
	schedule, err := a.store.GetReportSchedule(r.Context())
	if err != nil {
		a.logger.Error("get report schedule", "error", err)
		writeJSON(w, 500, map[string]string{"error": "get report schedule"})
		return
	}
	a.writeReportSchedule(w, schedule)
}

func (a *api) saveReportSchedule(w http.ResponseWriter, r *http.Request) {
	var schedule store.ReportSchedule
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&schedule); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid JSON body"})
		return
	}
	if schedule.Frequency != "off" && schedule.Frequency != "weekly" && schedule.Frequency != "monthly" {
		writeJSON(w, 400, map[string]string{"error": "frequency must be off, weekly, or monthly"})
		return
	}
	if schedule.Weekday < 0 || schedule.Weekday > 6 || schedule.MonthDay < 1 || schedule.MonthDay > 28 {
		writeJSON(w, 400, map[string]string{"error": "weekday must be between 0 and 6 and monthDay between 1 and 28"})
		return
	}
	saved, err := a.store.SaveReportSchedule(r.Context(), schedule)
	if err != nil {
		a.logger.Error("save report schedule", "error", err)
		writeJSON(w, 500, map[string]string{"error": "save report schedule"})
		return
	}
	a.writeReportSchedule(w, saved)
}

func (a *api) writeReportSchedule(w http.ResponseWriter, schedule store.ReportSchedule) {
	next := ""
	now := time.Now().In(a.cfg.Timezone)
	if schedule.Frequency == "weekly" {
		days := (schedule.Weekday - int(now.Weekday()) + 7) % 7
		target := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, a.cfg.Timezone).AddDate(0, 0, days)
		if !target.After(now) {
			target = target.AddDate(0, 0, 7)
		}
		next = target.Format(time.DateOnly)
	}
	if schedule.Frequency == "monthly" {
		target := time.Date(now.Year(), now.Month(), schedule.MonthDay, 0, 0, 0, 0, a.cfg.Timezone)
		if !target.After(now) {
			target = target.AddDate(0, 1, 0)
		}
		next = target.Format(time.DateOnly)
	}
	writeJSON(w, 200, map[string]any{
		"frequency": schedule.Frequency, "weekday": schedule.Weekday,
		"monthDay": schedule.MonthDay, "updatedAt": schedule.UpdatedAt, "nextReportAt": next,
	})
}
