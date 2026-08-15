# API server

`server` runs the authenticated HTTP API used by the FibreXWatch frontend. It reads usage and device data from PostgreSQL and stores login sessions and login-attempt limits in Redis. It does not connect to the router or collect readings.

## Start it

From the repository root:

```sh
make api
```

Or in the complete container stack:

```sh
docker compose up -d api
```

The native command loads `.env` from the repository root. The container receives the same settings through Compose, with container-specific database and Redis addresses supplied automatically.

Required services and settings:

- PostgreSQL with all migrations applied through `DATABASE_URL`.
- Redis through `REDIS_URL`.
- At least one account created with the `users` command.
- `ALLOWED_ORIGINS` containing every browser origin that may call the API.
- `AUTH_COOKIE_SECURE=true` whenever the browser accesses the application over HTTPS.

The server fails to start when PostgreSQL or Redis is unavailable. All `/api/v1/*` endpoints require a valid session except health, login, logout, and session inspection. Mutating authenticated requests also require the CSRF cookie/header pair generated during login.

## Health and shutdown

`GET /api/v1/health` checks PostgreSQL connectivity. The process listens on `API_ADDRESS`, defaults to loopback, and shuts down gracefully on `SIGINT` or `SIGTERM`.

When using Docker, nginx calls the API internally at `api:8080`; the API is not published on a host port.
