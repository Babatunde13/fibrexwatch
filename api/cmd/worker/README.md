# Ingestion worker

`worker` is the only FibreXWatch process that connects to the router. It periodically reads WAN counters and connected-device snapshots, converts cumulative counters into usage intervals, and writes the results to PostgreSQL.

## Start it

Run continuously from the repository root:

```sh
make worker
```

Run one collection cycle and exit:

```sh
make worker-once
```

Run it in the complete container stack:

```sh
docker compose up -d worker
docker compose logs -f worker
```

Important settings are `DATABASE_URL`, `ROUTER_ADAPTER`, `ROUTER_ADDRESS`, `ROUTER_USERNAME`, `ROUTER_PASSWORD`, `COLLECTION_INTERVAL`, and `RAW_RETENTION_DAYS`. See `docs/HUAWEI.md` for the Huawei-specific settings.

The worker obtains a PostgreSQL advisory lock at startup. A second worker using the same database exits instead of producing duplicate readings. On startup it also removes raw records older than the configured retention period.

`ROUTER_ADAPTER=simulated` is useful for testing. `ROUTER_ADAPTER=huawei-web` requires valid router credentials and network reachability from the worker host or container. The worker handles `SIGINT` and `SIGTERM` and stops after the active collection operation finishes.
