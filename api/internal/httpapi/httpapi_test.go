package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/local/mtn-fibrex/api/internal/config"
)

func TestBackupRequiresAuthentication(t *testing.T) {
	handler := New(
		slog.New(slog.NewTextHandler(io.Discard, nil)),
		nil,
		nil,
		config.Config{},
	)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/v1/export/backup", nil))
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusUnauthorized)
	}
	if response.Header().Get("Content-Disposition") != "" {
		t.Fatal("unauthenticated response must not include a backup attachment")
	}
}

func TestBackupDocumentMetadata(t *testing.T) {
	location := time.FixedZone("Africa/Lagos", 60*60)
	now := time.Date(2026, time.November, 12, 9, 8, 7, 0, location)
	tables := map[string]json.RawMessage{"devices": json.RawMessage(`[]`)}
	document := newBackupDocument(now, "huawei-web", tables)

	if document.SchemaVersion != 1 || document.Source != "huawei-web" {
		t.Fatalf("unexpected backup metadata: %+v", document)
	}
	if document.Timezone != "Africa/Lagos" || !document.GeneratedAt.Equal(now) {
		t.Fatalf("unexpected backup time metadata: %+v", document)
	}
	if filename := backupFilename(now); filename != "fibrex-backup-2026-11-12-090807.json" {
		t.Fatalf("filename = %q", filename)
	}
}

func TestValidCSRF(t *testing.T) {
	request := httptest.NewRequest(http.MethodPatch, "/api/v1/devices/1", nil)
	request.AddCookie(&http.Cookie{Name: csrfCookieName, Value: "token"})
	request.Header.Set("X-CSRF-Token", "token")
	if !validCSRF(request) {
		t.Fatal("expected matching CSRF cookie and header to be valid")
	}
	request.Header.Set("X-CSRF-Token", "different")
	if validCSRF(request) {
		t.Fatal("expected mismatched CSRF values to be invalid")
	}
}

func TestSecurityHeaders(t *testing.T) {
	handler := withSecurityHeaders(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}), config.Config{AuthCookieSecure: true})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/", nil))
	for _, header := range []string{"Content-Security-Policy", "Referrer-Policy", "X-Content-Type-Options", "X-Frame-Options", "Permissions-Policy", "Strict-Transport-Security"} {
		if response.Header().Get(header) == "" {
			t.Fatalf("expected %s header", header)
		}
	}
}

func TestStarterTimezone(t *testing.T) {
	location, err := time.LoadLocation("Africa/Lagos")
	if err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{Timezone: location}
	if got := cfg.Timezone.String(); got != "Africa/Lagos" {
		t.Fatalf("timezone = %q", got)
	}
}

func TestParseDateRange(t *testing.T) {
	location, err := time.LoadLocation("Africa/Lagos")
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest("GET", "/api/v1/usage/daily?from=2026-08-01&to=2026-08-15", nil)
	from, to, err := parseDateRange(request, location)
	if err != nil {
		t.Fatal(err)
	}
	if from.Format(time.DateOnly) != "2026-08-01" || to.Format(time.DateOnly) != "2026-08-15" || from.Location() != location {
		t.Fatalf("unexpected range: %v to %v", from, to)
	}
}

func TestParseDateRangeRejectsReverseRange(t *testing.T) {
	request := httptest.NewRequest("GET", "/api/v1/usage/daily?from=2026-08-15&to=2026-08-01", nil)
	if _, _, err := parseDateRange(request, time.UTC); err == nil {
		t.Fatal("expected reverse range error")
	}
}
