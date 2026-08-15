package main

import (
	"context"
	"flag"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/local/mtn-fibrex/api/internal/collector"
	"github.com/local/mtn-fibrex/api/internal/config"
	"github.com/local/mtn-fibrex/api/internal/router"
	"github.com/local/mtn-fibrex/api/internal/store"
)

func main() {
	once := flag.Bool("once", false, "collect once and exit (for cron/systemd timers)")
	flag.Parse()
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	cfg, err := config.Load()
	if err != nil {
		logger.Error("invalid configuration", "error", err)
		os.Exit(1)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("connect to database", "error", err)
		os.Exit(1)
	}
	defer db.Close()
	lockConnection, err := db.Acquire(ctx)
	if err != nil {
		logger.Error("acquire worker lock connection", "error", err)
		os.Exit(1)
	}
	defer lockConnection.Release()
	var locked bool
	if err := lockConnection.QueryRow(ctx, `SELECT pg_try_advisory_lock(hashtext('fibrex-ingestion-worker'))`).Scan(&locked); err != nil {
		logger.Error("acquire worker lock", "error", err)
		os.Exit(1)
	}
	if !locked {
		logger.Error("another ingestion worker is already running")
		os.Exit(1)
	}
	if err := db.PruneRawData(ctx, time.Now().AddDate(0, 0, -cfg.RawRetentionDays)); err != nil {
		logger.Error("prune retained raw readings", "error", err)
		os.Exit(1)
	}

	adapter, source, err := configuredAdapter(ctx, logger, cfg)
	if err != nil {
		logger.Error("configure ingestion worker", "error", err)
		os.Exit(1)
	}
	logger.Info("ingestion worker started", "adapter", source, "interval", cfg.CollectionInterval)
	ingestor := collector.New(logger, db, adapter, source, cfg.CollectionInterval)
	if *once {
		if err := ingestor.RunOnce(ctx); err != nil {
			logger.Error("one-shot ingestion failed", "error", err)
			os.Exit(1)
		}
		logger.Info("one-shot ingestion completed")
		return
	}
	ingestor.Run(ctx)
	logger.Info("ingestion worker stopped")
}

func configuredAdapter(ctx context.Context, logger *slog.Logger, cfg config.Config) (router.Adapter, string, error) {
	switch cfg.RouterAdapter {
	case "simulated":
		return router.NewSimulatedAdapter(), "simulated", nil
	case "huawei-web":
		adapter, err := router.NewHuaweiAdapter(cfg.RouterAddress, cfg.RouterInsecureTLS, cfg.RouterUsername, cfg.RouterPassword)
		if err != nil {
			return nil, "", err
		}
		if !adapter.HasCredentials() {
			return nil, "", router.ErrCredentialsRequired
		}
		identity, err := adapter.Identity(ctx)
		if err != nil {
			return nil, "", err
		}
		logger.Info("Huawei router discovered", "manufacturer", identity.Manufacturer, "model", identity.Model)
		if err := adapter.Authenticate(ctx); err != nil {
			return nil, "", err
		}
		logger.Info("Huawei router session authenticated")
		if cfg.RouterDiscovery {
			if err := logDiscovery(ctx, logger, adapter); err != nil {
				return nil, "", err
			}
		}
		return adapter, "huawei-web", nil
	case "none":
		return nil, "", configError("ROUTER_ADAPTER is none; configure an adapter before starting the worker")
	default:
		return nil, "", configError("unsupported ROUTER_ADAPTER: " + cfg.RouterAdapter)
	}
}

type configError string

func (e configError) Error() string { return string(e) }

func logDiscovery(ctx context.Context, logger *slog.Logger, adapter *router.HuaweiAdapter) error {
	discovery, err := adapter.Discovery(ctx)
	if err != nil {
		return err
	}
	logger.Info("Huawei authenticated landing page", "path", discovery.LandingPath)
	for _, page := range discovery.CounterPages {
		logger.Info("Huawei counter candidate", "path", page.Path, "fields", page.Fields, "structures", page.Structures, "references", page.References, "initClues", page.InitClues, "assignments", page.Assignments)
	}
	return nil
}
