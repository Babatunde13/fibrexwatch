# FibreXWatch

A localhost-first MTN FibreX data-usage and home-network monitor built with Go, PostgreSQL, and React.

FibreXWatch is open-source software available under the [MIT License](LICENSE). Contributions are welcome; read [CONTRIBUTING.md](CONTRIBUTING.md) before getting started.

The application runs a standalone ingestion worker, a read-only API, PostgreSQL, and a React dashboard. The Huawei worker records WAN usage and connected-device snapshots from the local ONT.

See [the operations runbook](docs/RUNBOOK.md) for complete setup and maintenance, and [the Huawei integration guide](docs/HUAWEI.md) for router setup, capabilities, and troubleshooting.

## Requirements

- Go 1.26.6+
- Node.js 22+
- Docker with Compose

## Start locally

For the complete Docker deployment, copy and edit the environment file, then start the entire stack:

```sh
cp .env.example .env
docker compose up -d --build
docker compose run --rm --entrypoint /app/fibrex-users api create
```

Open `http://localhost:5173`. PostgreSQL, Redis, migrations, the API, the ingestion worker, and the production web frontend are all managed by Compose. See the [runbook](docs/RUNBOOK.md) before configuring router credentials or exposing the application.

For native application development with only PostgreSQL and Redis in Docker:

```sh
cp .env.example .env
make db-up
cd web && npm install && cd ..
make create-user
```

Start each application process in its own terminal:

```sh
make worker
make api
make web
```

Open `http://localhost:5173`. The native API health endpoint is `http://localhost:8080/api/v1/health`.

Each Go command has its own reference:

- [API server](api/cmd/server/README.md)
- [Ingestion worker](api/cmd/worker/README.md)
- [User administration](api/cmd/users/README.md)

## Notifications

The current new-device alert is a browser notification, not a server push service. After permission is granted, the open dashboard polls the API every 30 seconds and compares active device IDs with the IDs previously stored in that browser's `localStorage`. A notification appears when polling finds a device that browser has seen for the first time. The initial device list establishes the baseline and does not alert.

Alerts work only while the dashboard is open, are configured separately for each browser and origin, and disappear if site storage is cleared. Browser notifications also require a secure context: HTTPS or localhost. FibreXWatch does not currently send alerts through email, SMS, mobile push, or a service worker. Data-plan thresholds currently appear as in-dashboard warnings rather than operating-system notifications.

## Usage analytics

The dashboard provides hourly heatmaps, peak-period and previous-period comparisons, router-wide usage exports, and per-device online-duration history. The Huawei HG8145X7-10 firmware exposes device presence and connection details but not cumulative per-device byte counters, so FibreXWatch does not estimate or rank device data usage.

## Login and ngrok sharing

Create one or more dashboard accounts before exposing FibreXWatch. Passwords are entered in a hidden terminal prompt, hashed with bcrypt, and stored in PostgreSQL:

```sh
make create-user
make create-user USERNAME=friend
make list-users
```

Reset a password interactively with `make reset-password`. You can also skip its username prompt with `make reset-password USERNAME=friend`. Disable an account with `make disable-user USERNAME=friend`. Password entry is always hidden. API startup never creates or changes accounts. The API always requires an account, so create the first one before signing in. Resetting a password or disabling an account immediately invalidates its existing sessions.

For ngrok, use one tunnel to the Vite server. Vite proxies `/api` to the Go API, keeping login cookies on one origin:

```env
VITE_API_URL=
VITE_API_PROXY_TARGET=http://localhost:8080
VITE_ALLOWED_HOSTS=.ngrok-free.app,localhost
ALLOWED_ORIGINS=https://your-domain.ngrok-free.app
AUTH_COOKIE_SECURE=true
```

Then run `make api`, `make web`, and `ngrok http 5173`. The API uses Redis-backed sessions, an HttpOnly session cookie, CSRF protection, and login throttling. `make db-up` starts both PostgreSQL and Redis on loopback-only ports. Never expose PostgreSQL, Redis, the worker, or the router admin interface through ngrok.

Both Go commands load the root `.env`. The worker is the only process that connects to and authenticates with the router; the API only reads PostgreSQL.

To exercise the complete collection and aggregation pipeline before a hardware adapter is configured, run the worker with the local simulator:

```sh
ROUTER_ADAPTER=simulated COLLECTION_INTERVAL=5s make worker
```

After two readings, the dashboard displays simulated daily and monthly usage. The simulator does not invent connected devices, so device counts remain zero until a router adapter supplies a client list.

## Huawei MTN ONT discovery

For the complete setup and troubleshooting reference, see [Huawei ONT integration](docs/HUAWEI.md).

The detected device is a Huawei HG8145X7-10 with an MTN-customized web interface at `https://192.168.100.1:80`. The self-signed local certificate requires `ROUTER_INSECURE_TLS=true` for discovery.

```sh
ROUTER_ADDRESS=https://192.168.100.1:80 \
ROUTER_ADAPTER=huawei-web \
ROUTER_INSECURE_TLS=true \
make worker
```

This starts read-only authenticated collection from the confirmed Huawei statistics interface.

Add credentials only to the gitignored root `.env` file:

```env
ROUTER_USERNAME=your_router_username
ROUTER_PASSWORD=your_router_password
```

The worker loads `.env` from the repository root when started with `make worker`. Huawei authentication is limited to one attempt per worker process to avoid triggering the router's failed-login lockout. Passwords are never returned by the API or written to logs.

## Verify

```sh
make test
make build
```

## Backup and move to a new server

Create a complete timestamped PostgreSQL backup:

```sh
make backup
```

Copy the resulting file from `backups/` to the new server, start its database, and restore it before starting the worker:

```sh
make db-up
make restore BACKUP=backups/fibrex-YYYYMMDD-HHMMSS.sql
make worker
```

The backup includes raw readings, usage intervals, device/address history, friendly names, data-plan settings, worker events, and collection history. Stop the worker during restore so it cannot write into the database concurrently.

## Background ingestion and installation

`make build` creates `api/bin/fibrex-api` and `api/bin/fibrex-worker`. For a simple local or single-server installation, start the compiled worker in the background:

```sh
make worker-background
make worker-status
tail -f api/logs/fibrexwatch-worker.log
make worker-stop
```

The background target stores its PID in `api/run/fibrexwatch-worker.pid` and appends output to `api/logs/fibrexwatch-worker.log`. It refuses to start a second worker while that PID is active.

The worker also supports one-shot execution directly:

```sh
make worker-once
# or: api/bin/fibrex-worker --once
```
