package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	APIAddress         string
	DatabaseURL        string
	RedisURL           string
	RouterAddress      string
	RouterAdapter      string
	RouterInsecureTLS  bool
	RouterUsername     string
	RouterPassword     string
	RouterDiscovery    bool
	RouterSSIDName     string
	Router24GHzSSIDs   []string
	Router5GHzSSIDs    []string
	AllowedOrigins     string
	CollectionInterval time.Duration
	RawRetentionDays   int
	Timezone           *time.Location
	AuthSessionTTL     time.Duration
	AuthCookieSecure   bool
}

func Load() (Config, error) {
	if err := loadDotEnv(); err != nil {
		return Config{}, err
	}
	interval, err := time.ParseDuration(envOrDefault("COLLECTION_INTERVAL", "60s"))
	if err != nil || interval < 5*time.Second {
		return Config{}, fmt.Errorf("COLLECTION_INTERVAL must be a duration of at least 5s")
	}

	timezone, err := time.LoadLocation(envOrDefault("APP_TIMEZONE", "Africa/Lagos"))
	if err != nil {
		return Config{}, fmt.Errorf("load APP_TIMEZONE: %w", err)
	}

	allowedOriginSlice := envSliceOrDefault("ALLOWED_ORIGINS", "http://localhost:5173", ",")
	allowedOrigins := strings.Join(allowedOriginSlice, ", ")
	insecureTLS, err := strconv.ParseBool(envOrDefault("ROUTER_INSECURE_TLS", "false"))
	if err != nil {
		return Config{}, fmt.Errorf("ROUTER_INSECURE_TLS must be true or false")
	}

	discovery, err := strconv.ParseBool(envOrDefault("ROUTER_DISCOVERY", "false"))
	if err != nil {
		return Config{}, fmt.Errorf("ROUTER_DISCOVERY must be true or false")
	}

	username, password := os.Getenv("ROUTER_USERNAME"), os.Getenv("ROUTER_PASSWORD")
	if (username == "") != (password == "") {
		return Config{}, fmt.Errorf("ROUTER_USERNAME and ROUTER_PASSWORD must be set together")
	}

	retentionDays, err := strconv.Atoi(envOrDefault("RAW_RETENTION_DAYS", "90"))
	if err != nil || retentionDays < 1 {
		return Config{}, fmt.Errorf("RAW_RETENTION_DAYS must be a positive integer")
	}

	sessionTTL, err := time.ParseDuration(envOrDefault("AUTH_SESSION_TTL", "24h"))
	if err != nil || sessionTTL < time.Minute {
		return Config{}, fmt.Errorf("AUTH_SESSION_TTL must be a duration of at least 1m")
	}

	cookieSecure, err := strconv.ParseBool(envOrDefault("AUTH_COOKIE_SECURE", "false"))
	if err != nil {
		return Config{}, fmt.Errorf("AUTH_COOKIE_SECURE must be true or false")
	}

	return Config{
		APIAddress:         envOrDefault("API_ADDRESS", "127.0.0.1:8080"),
		DatabaseURL:        envOrDefault("DATABASE_URL", "postgres://fibrex:fibrex@localhost:5433/fibrex?sslmode=disable"),
		RedisURL:           envOrDefault("REDIS_URL", "redis://localhost:6379/0"),
		RouterAddress:      os.Getenv("ROUTER_ADDRESS"),
		RouterAdapter:      envOrDefault("ROUTER_ADAPTER", "none"),
		RouterInsecureTLS:  insecureTLS,
		RouterUsername:     username,
		RouterPassword:     password,
		RouterDiscovery:    discovery,
		RouterSSIDName:     envOrDefault("ROUTER_SSID_NAME", "SSID-1"),
		Router24GHzSSIDs:   envSliceOrDefault("ROUTER_24GHZ_SSIDS", "SSID-1,SSID1", ","),
		Router5GHzSSIDs:    envSliceOrDefault("ROUTER_5GHZ_SSIDS", "SSID-5,SSID5", ","),
		CollectionInterval: interval,
		RawRetentionDays:   retentionDays,
		Timezone:           timezone,
		AllowedOrigins:     allowedOrigins,
		AuthSessionTTL:     sessionTTL,
		AuthCookieSecure:   cookieSecure,
	}, nil
}

func (c Config) ConnectionBand(ssidName, connectionType string) string {
	if strings.Contains(strings.ToLower(connectionType), "eth") {
		return "Ethernet"
	}
	for _, ssid := range c.Router24GHzSSIDs {
		if strings.EqualFold(ssid, ssidName) {
			return "2.4 GHz"
		}
	}
	for _, ssid := range c.Router5GHzSSIDs {
		if strings.EqualFold(ssid, ssidName) {
			return "5 GHz"
		}
	}
	return "Unknown"
}

func (c Config) FilterSSIDName(ssidName string) string {
	for _, group := range [][]string{c.Router24GHzSSIDs, c.Router5GHzSSIDs} {
		for _, candidate := range group {
			if strings.EqualFold(candidate, ssidName) && len(group) > 0 {
				return group[0]
			}
		}
	}
	if strings.TrimSpace(ssidName) != "" {
		return ssidName
	}
	return c.RouterSSIDName
}

func loadDotEnv() error {
	for _, filename := range []string{".env", "../.env"} {
		if err := godotenv.Load(filename); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("load %s: %w", filename, err)
		}
	}
	return nil
}

func envOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func envSliceOrDefault(key, fallback, separator string) []string {
	value := os.Getenv(key)
	list := []string{}
	if value != "" {
		list = strings.Split(value, separator)
	} else {
		list = strings.Split(fallback, separator)
	}
	for i, v := range list {
		list[i] = strings.TrimSpace(v)
	}
	return list
}
