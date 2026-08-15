# FibreXWatch operations runbook

This runbook covers a first installation, normal operations, upgrades, backup and recovery, and common failures. The recommended deployment keeps FibreXWatch on the same network as the Huawei ONT because the worker must reach the router's private address.

## 1. Host requirements

- Docker Engine with Docker Compose v2.
- A Linux, macOS, or Windows host that can reach the router at `192.168.100.1`.
- Ports 5173, 5433, and 6379 available on loopback, or alternative values configured in `.env`.
- Enough persistent storage for the `fibrex_postgres` Docker volume.

Only the web port should be shared through ngrok or a reverse proxy. PostgreSQL and Redis are intentionally bound to `127.0.0.1`.

## 2. Configure the installation

Copy the environment template:

```sh
cp .env.example .env
```

At minimum, set a long random `POSTGRES_PASSWORD`, update the same password inside the native `DATABASE_URL`, and configure the router:

```env
POSTGRES_DB=fibrex
POSTGRES_USER=fibrex
POSTGRES_PASSWORD=a-long-random-password
DATABASE_URL=postgres://fibrex:a-long-random-password@localhost:5433/fibrex?sslmode=disable

ROUTER_ADDRESS=https://192.168.100.1:80
ROUTER_ADAPTER=huawei-web
ROUTER_USERNAME=your-router-user
ROUTER_PASSWORD=your-router-password
ROUTER_INSECURE_TLS=true
```

If the database password contains URI-reserved characters, percent-encode it in `DATABASE_URL`. Keep `.env` outside source control and restrict it with `chmod 600 .env` on Unix systems.

For a safe hardware-free check, use `ROUTER_ADAPTER=simulated` first.

## 3. Build and start everything

Build images, apply migrations, and start the services:

```sh
docker compose up -d --build
docker compose ps
```

The stack contains:

- `postgres`: persistent application data.
- `redis`: expiring sessions and login-attempt counters.
- `migrate`: applies every idempotent SQL migration and exits successfully.
- `api`: authenticated Go API available only inside the Compose network.
- `worker`: router ingestion process protected by a PostgreSQL singleton lock.
- `web`: compiled React application served by nginx, including the `/api` proxy.

Open `http://localhost:5173`. A login account must be created before the dashboard can be used.

## 4. Create the first account

```sh
docker compose run --rm --entrypoint /app/fibrex-users api create
```

The command prompts for the username and securely prompts twice for the password. Additional account operations are documented in `api/cmd/users/README.md`.

## 5. Verify collection

Follow the worker and API logs:

```sh
docker compose logs -f worker api
```

Check the externally reachable health endpoint through nginx:

```sh
curl -i http://localhost:5173/api/v1/health
```

The worker should log router discovery, authentication, and successful collection cycles. The first counter sample establishes a baseline; usage appears after a later sample produces a delta.

## 6. Share with ngrok

Keep the API behind the web container and tunnel only the frontend:

```env
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,https://your-domain.ngrok-free.app
AUTH_COOKIE_SECURE=true
```

Recreate the API after changing its environment and start the tunnel. When returning to plain local HTTP, set `AUTH_COOKIE_SECURE=false` again or the browser will correctly refuse to send the secure session cookie:

```sh
docker compose up -d --force-recreate api
ngrok http 5173
```

Do not tunnel ports 5433 or 6379, the router interface, or a separately published API port.

## 7. Routine operations

Inspect service state and recent logs:

```sh
docker compose ps
docker compose logs --tail=200 api worker web
```

Restart one component:

```sh
docker compose restart worker
```

Stop the stack without deleting stored data:

```sh
docker compose down
```

PostgreSQL data remains in the named volume. Do not add `--volumes` unless permanent deletion is intended.

## 8. Upgrade

Back up PostgreSQL first, update the source, then rebuild:

```sh
make backup
git pull
docker compose up -d --build
docker compose ps
```

The migration container runs before the API and worker start. Review logs if it exits unsuccessfully.

## 9. Backup and restore

Create a timestamped SQL backup:

```sh
make backup
```

Protect backup files because they contain password hashes and network metadata:

```sh
chmod 600 backups/*.sql
```

To restore, stop writers, start PostgreSQL, and load the selected backup:

```sh
docker compose stop api worker
docker compose up -d postgres
make restore BACKUP=backups/fibrex-YYYYMMDD-HHMMSS.sql
docker compose up -d
```

Redis is intentionally non-persistent. A Redis restart logs users out but does not affect usage data.

## 10. Troubleshooting

### API repeatedly restarts

Check `docker compose logs api`. The API fails closed when PostgreSQL or Redis is unavailable. Confirm both health checks pass and that the migration service exited with status zero.

### Login always fails

Run the user list command and create or reset an account if needed. Five failed attempts for the same username/client combination cause a 15-minute lockout stored in Redis.

### Worker cannot reach the router

Confirm the Docker host itself can open `ROUTER_ADDRESS`, verify credentials by logging into the router, and read `docs/HUAWEI.md`. Docker Desktop and VPN/firewall rules can prevent containers from reaching private LAN addresses even when the host can.

### Worker says another instance is running

Use `docker compose ps` and stop any native worker. The PostgreSQL advisory lock intentionally permits only one active ingestion process.

### Dashboard loads but API requests fail

Check nginx and API logs, verify the API health check, and ensure the browser origin exactly matches `ALLOWED_ORIGINS`. With HTTPS, `AUTH_COOKIE_SECURE` must be `true`; with plain localhost HTTP, it must be `false`.
