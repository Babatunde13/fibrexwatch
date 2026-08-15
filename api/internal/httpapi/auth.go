package httpapi

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/local/mtn-fibrex/api/internal/store"
	"github.com/redis/go-redis/v9"
)

const (
	sessionCookieName = "fibrexwatch_session"
	csrfCookieName    = "fibrexwatch_csrf"
	loginLimit        = 5
	loginWindow       = 15 * time.Minute
)

type authenticator struct {
	store  *store.Store
	redis  *redis.Client
	ttl    time.Duration
	secure bool
}

type authSession struct {
	Username    string `json:"username"`
	AuthVersion int64  `json:"authVersion"`
}

func newAuthenticator(repository *store.Store, redisClient *redis.Client, ttl time.Duration, secure bool) *authenticator {
	return &authenticator{store: repository, redis: redisClient, ttl: ttl, secure: secure}
}

func (a *authenticator) login(w http.ResponseWriter, r *http.Request) {
	var credentials struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&credentials); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid login request"})
		return
	}
	credentials.Username = strings.TrimSpace(credentials.Username)
	address := clientAddress(r)
	limited, err := a.loginLimited(r.Context(), credentials.Username, address)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "authentication service unavailable"})
		return
	}
	if limited {
		w.Header().Set("Retry-After", fmt.Sprint(int(loginWindow.Seconds())))
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "too many login attempts; try again later"})
		return
	}
	user, valid, err := a.store.AuthenticateUser(r.Context(), credentials.Username, credentials.Password)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "authenticate user"})
		return
	}
	if !valid {
		if err := a.recordLoginFailure(r.Context(), credentials.Username, address); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "authentication service unavailable"})
			return
		}
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid username or password"})
		return
	}
	if err := a.clearLoginFailures(r.Context(), credentials.Username, address); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "authentication service unavailable"})
		return
	}
	token, err := randomToken()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "create session"})
		return
	}
	csrfToken, err := randomToken()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "create session"})
		return
	}
	payload, err := json.Marshal(authSession{Username: user.Username, AuthVersion: user.AuthVersion})
	if err != nil || a.redis.Set(r.Context(), sessionKey(token), payload, a.ttl).Err() != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "authentication service unavailable"})
		return
	}
	expires := time.Now().Add(a.ttl)
	http.SetCookie(w, a.cookie(sessionCookieName, token, true, expires, int(a.ttl.Seconds())))
	http.SetCookie(w, a.cookie(csrfCookieName, csrfToken, false, expires, int(a.ttl.Seconds())))
	writeJSON(w, http.StatusOK, map[string]any{"authenticated": true, "authenticationEnabled": true, "username": user.Username})
}

func (a *authenticator) logout(w http.ResponseWriter, r *http.Request) {
	if _, err := r.Cookie(sessionCookieName); err == nil && !validCSRF(r) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "invalid CSRF token"})
		return
	}
	if cookie, err := r.Cookie(sessionCookieName); err == nil {
		_ = a.redis.Del(r.Context(), sessionKey(cookie.Value)).Err()
	}
	http.SetCookie(w, a.cookie(sessionCookieName, "", true, time.Unix(1, 0), -1))
	http.SetCookie(w, a.cookie(csrfCookieName, "", false, time.Unix(1, 0), -1))
	writeJSON(w, http.StatusOK, map[string]bool{"authenticated": false})
}

func (a *authenticator) cookie(name, value string, httpOnly bool, expires time.Time, maxAge int) *http.Cookie {
	return &http.Cookie{Name: name, Value: value, Path: "/", HttpOnly: httpOnly, Secure: a.secure, SameSite: http.SameSiteLaxMode, Expires: expires, MaxAge: maxAge}
}

func (a *authenticator) session(w http.ResponseWriter, r *http.Request) {
	username, authenticated, err := a.sessionUser(r.Context(), r)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "authentication service unavailable"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"authenticated": authenticated, "authenticationEnabled": true, "username": username})
}

func (a *authenticator) require(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, authenticated, err := a.sessionUser(r.Context(), r)
		if err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "authentication service unavailable"})
			return
		}
		if !authenticated {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
			return
		}
		if isUnsafeMethod(r.Method) && !validCSRF(r) {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "invalid CSRF token"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *authenticator) sessionUser(ctx context.Context, r *http.Request) (string, bool, error) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil || strings.TrimSpace(cookie.Value) == "" {
		return "", false, nil
	}
	payload, err := a.redis.Get(ctx, sessionKey(cookie.Value)).Bytes()
	if errors.Is(err, redis.Nil) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	var session authSession
	if err := json.Unmarshal(payload, &session); err != nil {
		_ = a.redis.Del(ctx, sessionKey(cookie.Value)).Err()
		return "", false, nil
	}
	version, enabled, err := a.store.UserAuthVersion(ctx, session.Username)
	if err != nil {
		return "", false, err
	}
	if !enabled || version != session.AuthVersion {
		_ = a.redis.Del(ctx, sessionKey(cookie.Value)).Err()
		return "", false, nil
	}
	return session.Username, true, nil
}

func (a *authenticator) loginLimited(ctx context.Context, username, address string) (bool, error) {
	count, err := a.redis.Get(ctx, loginAttemptKey(username, address)).Int()
	if errors.Is(err, redis.Nil) {
		return false, nil
	}
	return count >= loginLimit, err
}

func (a *authenticator) recordLoginFailure(ctx context.Context, username, address string) error {
	key := loginAttemptKey(username, address)
	pipe := a.redis.TxPipeline()
	pipe.Incr(ctx, key)
	pipe.Expire(ctx, key, loginWindow)
	_, err := pipe.Exec(ctx)
	return err
}

func (a *authenticator) clearLoginFailures(ctx context.Context, username, address string) error {
	return a.redis.Del(ctx, loginAttemptKey(username, address)).Err()
}

func loginAttemptKey(username, address string) string {
	digest := sha256.Sum256([]byte(strings.ToLower(username) + "\x00" + address))
	return "fibrexwatch:login:" + hex.EncodeToString(digest[:])
}

func sessionKey(token string) string {
	digest := sha256.Sum256([]byte(token))
	return "fibrexwatch:session:" + hex.EncodeToString(digest[:])
}

func randomToken() (string, error) {
	value := make([]byte, 32)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return hex.EncodeToString(value), nil
}

func clientAddress(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if ip := net.ParseIP(host); ip != nil && ip.IsLoopback() {
		if forwarded := strings.TrimSpace(strings.Split(r.Header.Get("X-Forwarded-For"), ",")[0]); forwarded != "" {
			return forwarded
		}
	}
	return host
}

func isUnsafeMethod(method string) bool {
	return method != http.MethodGet && method != http.MethodHead && method != http.MethodOptions
}

func validCSRF(r *http.Request) bool {
	cookie, err := r.Cookie(csrfCookieName)
	header := r.Header.Get("X-CSRF-Token")
	if err != nil || cookie.Value == "" || len(cookie.Value) != len(header) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(header)) == 1
}
