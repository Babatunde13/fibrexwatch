package httpapi

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/local/mtn-fibrex/api/internal/config"
	"github.com/local/mtn-fibrex/api/internal/store"
	"github.com/redis/go-redis/v9"
)

type api struct {
	logger *slog.Logger
	store  *store.Store
	cfg    config.Config
}

func New(logger *slog.Logger, repository *store.Store, redisClient *redis.Client, cfg config.Config) http.Handler {
	a := &api{logger: logger, store: repository, cfg: cfg}
	protected := http.NewServeMux()
	protected.HandleFunc("GET /api/v1/status", a.status)
	protected.HandleFunc("GET /api/v1/router", a.routerCapabilities)
	protected.HandleFunc("POST /api/v1/collector/run", a.collectNow)
	protected.HandleFunc("GET /api/v1/usage/today", a.today)
	protected.HandleFunc("GET /api/v1/usage/month", a.month)
	protected.HandleFunc("GET /api/v1/usage/daily", a.daily)
	protected.HandleFunc("GET /api/v1/usage/history", a.usageHistory)
	protected.HandleFunc("GET /api/v1/usage/plan", a.planUsage)
	protected.HandleFunc("GET /api/v1/devices", a.devices)
	protected.HandleFunc("GET /api/v1/devices/{id}", a.device)
	protected.HandleFunc("PATCH /api/v1/devices/{id}", a.updateDevice)
	protected.HandleFunc("DELETE /api/v1/devices/{id}", a.archiveDevice)
	protected.HandleFunc("POST /api/v1/devices/{id}/restore", a.restoreDevice)
	protected.HandleFunc("POST /api/v1/devices/{id}/block", a.blockDevice)
	protected.HandleFunc("DELETE /api/v1/devices/{id}/permanent", a.deleteDevice)
	protected.HandleFunc("GET /api/v1/devices/{id}/history", a.deviceHistory)
	protected.HandleFunc("GET /api/v1/settings/data-plan", a.getDataPlan)
	protected.HandleFunc("PATCH /api/v1/settings/data-plan", a.saveDataPlan)

	auth := newAuthenticator(repository, redisClient, cfg.AuthSessionTTL, cfg.AuthCookieSecure)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/health", a.health)
	mux.HandleFunc("POST /api/v1/auth/login", auth.login)
	mux.HandleFunc("POST /api/v1/auth/logout", auth.logout)
	mux.HandleFunc("GET /api/v1/auth/session", auth.session)
	mux.Handle("/api/v1/", auth.require(protected))
	return withSecurityHeaders(withCORS(withRequestLog(logger, mux), cfg), cfg)
}

func (a *api) health(w http.ResponseWriter, r *http.Request) {
	if err := a.store.Ping(r.Context()); err != nil {
		writeJSON(w, 503, map[string]string{"status": "unhealthy"})
		return
	}
	writeJSON(w, 200, map[string]string{"status": "healthy"})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func withCORS(next http.Handler, cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		originAllowed := origin == ""
		for _, allowed := range strings.Split(cfg.AllowedOrigins, ",") {
			if strings.TrimSpace(allowed) == origin {
				originAllowed = true
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Add("Vary", "Origin")
				break
			}
		}
		if !originAllowed {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "origin is not allowed"})
			return
		}
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(204)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func withSecurityHeaders(next http.Handler, cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		if cfg.AuthCookieSecure {
			w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		next.ServeHTTP(w, r)
	})
}

func withRequestLog(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		next.ServeHTTP(w, r)
		logger.Info("request", "method", r.Method, "path", r.URL.Path, "duration", time.Since(started))
	})
}
