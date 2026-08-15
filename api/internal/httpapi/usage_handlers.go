package httpapi

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/local/mtn-fibrex/api/internal/store"
)

func (a *api) today(w http.ResponseWriter, r *http.Request) {
	now := time.Now().In(a.cfg.Timezone)
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, a.cfg.Timezone)
	a.usageSummary(w, r, start, start.AddDate(0, 0, 1), now.Format(time.DateOnly))
}

func (a *api) month(w http.ResponseWriter, r *http.Request) {
	now := time.Now().In(a.cfg.Timezone)
	month := now.Format("2006-01")
	if requested := r.URL.Query().Get("month"); requested != "" {
		month = requested
	}
	start, err := time.ParseInLocation("2006-01", month, a.cfg.Timezone)
	if err != nil {
		writeJSON(w, 400, map[string]string{"error": "month must use YYYY-MM format"})
		return
	}
	a.usageSummary(w, r, start, start.AddDate(0, 1, 0), month)
}

func (a *api) daily(w http.ResponseWriter, r *http.Request) {
	from, to, err := parseDateRange(r, a.cfg.Timezone)
	if err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	history, err := a.store.DailyUsageHistory(r.Context(), a.cfg.RouterAdapter, a.cfg.Timezone.String(), from, to.AddDate(0, 0, 1))
	if err != nil {
		a.logger.Error("load daily usage", "error", err)
		writeJSON(w, 500, map[string]string{"error": "load daily usage"})
		return
	}
	type day struct {
		Date          string `json:"date"`
		DownloadBytes int64  `json:"downloadBytes"`
		UploadBytes   int64  `json:"uploadBytes"`
		TotalBytes    int64  `json:"totalBytes"`
	}
	days := make([]day, 0, len(history))
	var download, upload int64
	for _, item := range history {
		download += item.DownloadBytes
		upload += item.UploadBytes
		days = append(days, day{item.Date.Format(time.DateOnly), item.DownloadBytes, item.UploadBytes, item.DownloadBytes + item.UploadBytes})
	}
	writeJSON(w, 200, map[string]any{"from": from.Format(time.DateOnly), "to": to.Format(time.DateOnly), "available": len(days) > 0, "downloadBytes": download, "uploadBytes": upload, "totalBytes": download + upload, "days": days})
}

func (a *api) usageHistory(w http.ResponseWriter, r *http.Request) {
	from, to, err := parseDateRange(r, a.cfg.Timezone)
	if err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	granularity := r.URL.Query().Get("granularity")
	if granularity == "" {
		granularity = "day"
	}
	end := to.AddDate(0, 0, 1)
	points, err := a.store.UsageHistory(r.Context(), a.cfg.RouterAdapter, a.cfg.Timezone.String(), granularity, from, end)
	if err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	if r.URL.Query().Get("format") == "csv" {
		writeUsageCSV(w, from, to, granularity, points)
		return
	}
	if r.URL.Query().Get("format") == "json" {
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="fibrex-usage-%s-%s.json"`, from.Format(time.DateOnly), to.Format(time.DateOnly)))
	}
	items := make([]map[string]any, 0, len(points))
	var total int64
	for _, item := range points {
		value := item.DownloadBytes + item.UploadBytes
		total += value
		items = append(items, map[string]any{"period": formatUsagePeriod(item.Period, granularity), "downloadBytes": item.DownloadBytes, "uploadBytes": item.UploadBytes, "totalBytes": value, "readingCount": item.ReadingCount})
	}
	duration := end.Sub(from)
	previous, err := a.store.SummarizeUsage(r.Context(), a.cfg.RouterAdapter, from.Add(-duration), from)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "summarize comparison usage"})
		return
	}
	previousTotal := previous.DownloadBytes + previous.UploadBytes
	change := float64(0)
	if previousTotal > 0 {
		change = float64(total-previousTotal) * 100 / float64(previousTotal)
	}
	writeJSON(w, 200, map[string]any{"from": from.Format(time.DateOnly), "to": to.Format(time.DateOnly), "granularity": granularity, "totalBytes": total, "previousTotalBytes": previousTotal, "changePercentage": change, "points": items})
}

func writeUsageCSV(w http.ResponseWriter, from, to time.Time, granularity string, points []store.UsagePoint) {
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="fibrex-usage-%s-%s.csv"`, from.Format(time.DateOnly), to.Format(time.DateOnly)))
	writer := csv.NewWriter(w)
	_ = writer.Write([]string{"period", "download_bytes", "upload_bytes", "total_bytes", "reading_count"})
	for _, point := range points {
		_ = writer.Write([]string{formatUsagePeriod(point.Period, granularity), strconv.FormatInt(point.DownloadBytes, 10), strconv.FormatInt(point.UploadBytes, 10), strconv.FormatInt(point.DownloadBytes+point.UploadBytes, 10), strconv.FormatInt(point.ReadingCount, 10)})
	}
	writer.Flush()
}

func formatUsagePeriod(value time.Time, granularity string) string {
	if granularity == "hour" {
		return value.Format("2006-01-02T15:00:00")
	}
	if granularity == "month" {
		return value.Format("2006-01")
	}
	return value.Format(time.DateOnly)
}

func parseDateRange(r *http.Request, location *time.Location) (time.Time, time.Time, error) {
	fromText, toText := r.URL.Query().Get("from"), r.URL.Query().Get("to")
	if fromText == "" || toText == "" {
		return time.Time{}, time.Time{}, fmt.Errorf("from and to are required in YYYY-MM-DD format")
	}
	from, err := time.ParseInLocation(time.DateOnly, fromText, location)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("from must use YYYY-MM-DD format")
	}
	to, err := time.ParseInLocation(time.DateOnly, toText, location)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("to must use YYYY-MM-DD format")
	}
	if to.Before(from) {
		return time.Time{}, time.Time{}, fmt.Errorf("to must be on or after from")
	}
	if to.Sub(from) > 366*24*time.Hour {
		return time.Time{}, time.Time{}, fmt.Errorf("date range cannot exceed 366 days")
	}
	return from, to, nil
}

func (a *api) usageSummary(w http.ResponseWriter, r *http.Request, start, end time.Time, period string) {
	summary, err := a.store.SummarizeUsage(r.Context(), a.cfg.RouterAdapter, start, end)
	if err != nil {
		a.logger.Error("summarize usage", "error", err)
		writeJSON(w, 500, map[string]string{"error": "summarize usage"})
		return
	}
	available := summary.ReadingCount > 0
	reason := ""
	if !available {
		reason = "Waiting for two router readings before usage can be calculated."
	}
	writeJSON(w, 200, map[string]any{"period": period, "available": available, "downloadBytes": summary.DownloadBytes, "uploadBytes": summary.UploadBytes, "totalBytes": summary.DownloadBytes + summary.UploadBytes, "activeDevices": summary.ActiveDevices, "unavailableReason": reason})
}
