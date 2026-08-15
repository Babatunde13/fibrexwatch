# Contributing to FibreXWatch

Thanks for helping improve FibreXWatch. Contributions can include bug fixes, router-adapter improvements, tests, documentation, accessibility work, and focused feature proposals.

## Before contributing

- Search existing issues and pull requests before starting overlapping work.
- Open an issue before making a large architectural change or adding a major dependency.
- Never include router credentials, `.env` files, database dumps, session cookies, MAC addresses, public tunnel URLs, or other private network data in an issue or commit.
- Do not test device-control behavior against a network you do not own or administer.

## Development setup

Requirements:

- Go 1.26.6 or later
- Node.js 22 or later
- Docker with Docker Compose v2
- pre-commit (recommended)

Create a local configuration and start PostgreSQL and Redis:

```sh
cp .env.example .env
make db-up
```

Use a strong local database password and update both `POSTGRES_PASSWORD` and `DATABASE_URL`. For development without router hardware, set:

```env
ROUTER_ADAPTER=simulated
COLLECTION_INTERVAL=5s
```

Install frontend dependencies and create a login account:

```sh
cd web
npm install
cd ..
make create-user
```

Run the API, worker, and frontend in separate terminals:

```sh
make api
make worker
make web
```

Alternatively, build and start the complete production-style stack:

```sh
docker compose up -d --build
docker compose run --rm --entrypoint /app/fibrex-users api create
```

See [the operations runbook](docs/RUNBOOK.md) and the command documentation under `api/cmd/` for more detail.

Install the repository hooks once per clone:

```sh
python3 -m pip install pre-commit # or with homebrew, apt, etc.
make precommit-install
```

The hooks reject common sensitive files, check Go formatting and tests, lint and type-check the frontend, and validate Compose when relevant files change. Run every hook manually with `make precommit`. GitHub Actions repeats these checks and builds all production images for pushes to `main` and pull requests.

## Making changes

Keep changes focused and preserve the separation of responsibilities:

- `api/cmd/server` serves the authenticated API and does not contact the router.
- `api/cmd/worker` is the only process that collects router data.
- `api/internal/router` contains router-specific behavior behind the adapter interface.
- `api/internal/store` owns PostgreSQL queries and models.
- `web/src/api`, `web/src/components`, and `web/src/utils` separate frontend transport, UI, and reusable logic.

Add a numbered, idempotent SQL migration under `api/migrations/` for every schema change. Never edit a migration that may already have been applied by another installation.

Router integrations should use bounded response reads, request timeouts, sanitized logs, and fixture-based tests. Avoid adding undocumented write operations to a router adapter without explaining their effect and recovery behavior.

## Formatting and tests

Before opening a pull request, run:

```sh
make fmt
make test
make build
docker compose config --quiet
```

Changes to Dockerfiles or nginx should also be verified with:

```sh
docker compose build api worker web
docker compose run --rm --no-deps web nginx -t
```

Add or update tests for behavior changes. Authentication, device-control, counter rollover, migrations, and router parsing deserve particular care.

## Commit and pull-request guidance

- Write clear, imperative commit messages.
- Explain the problem, implementation, and user-visible effect in the pull request.
- Include verification commands and their results.
- Include screenshots for meaningful interface changes.
- Call out schema migrations, configuration changes, compatibility risks, and manual deployment steps.
- Keep unrelated refactoring out of feature and bug-fix pull requests.

By submitting a contribution, you agree that it is licensed under the project's MIT License.

## Reporting security issues

Do not publish exploitable vulnerabilities, credentials, private router responses, or personal network information in a public issue. Contact the project maintainer privately through the security-reporting channel listed on the repository. Include reproduction steps with secrets and identifying data removed.

If no private reporting channel is configured yet, report only that you have found a potential security issue and ask the maintainer how to share the details securely.

## Code of conduct

Be respectful, constructive, and patient. Harassment, discrimination, personal attacks, and publication of another person's private information are not acceptable in project spaces.
