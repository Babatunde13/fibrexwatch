.PHONY: db-up db-down api create-user list-users disable-user reset-password worker worker-once worker-bin worker-background worker-status worker-stop web fmt test build precommit-install precommit backup restore

db-up:
	docker compose up -d postgres redis migrate

db-down:
	docker compose down

api:
	@if [ -f .env ]; then set -a && . ./.env && set +a; fi && cd api && go run ./cmd/server

create-user:
	cd api && go run ./cmd/users create $(if $(USERNAME),--username "$(USERNAME)",)

list-users:
	cd api && go run ./cmd/users list

disable-user:
	@test -n "$(USERNAME)" || (echo "Usage: make disable-user USERNAME=name" && exit 1)
	cd api && go run ./cmd/users disable --username "$(USERNAME)"

reset-password:
	cd api && go run ./cmd/users reset-password $(if $(USERNAME),--username "$(USERNAME)",)

worker:
	@if [ -f .env ]; then set -a && . ./.env && set +a; fi && cd api && go run ./cmd/worker

worker-once:
	@if [ -f .env ]; then set -a && . ./.env && set +a; fi && cd api && go run ./cmd/worker --once

worker-bin:
	@mkdir -p api/bin
	cd api && go build -o bin/fibrex-worker ./cmd/worker

worker-background: worker-bin
	@mkdir -p api/run api/logs
	@if [ -f api/run/fibrexwatch-worker.pid ] && kill -0 "$$(cat api/run/fibrexwatch-worker.pid)" 2>/dev/null; then \
		echo "FibreXWatch worker is already running (PID $$(cat api/run/fibrexwatch-worker.pid))"; \
	else \
		if [ -f .env ]; then set -a; . ./.env; set +a; fi; \
		nohup ./api/bin/fibrex-worker >> api/logs/fibrexwatch-worker.log 2>&1 & \
		echo $$! > api/run/fibrexwatch-worker.pid; \
		echo "FibreXWatch worker started (PID $$(cat api/run/fibrexwatch-worker.pid))"; \
		echo "Logs: api/logs/fibrexwatch-worker.log"; \
	fi

worker-status:
	@if [ -f api/run/fibrexwatch-worker.pid ] && kill -0 "$$(cat api/run/fibrexwatch-worker.pid)" 2>/dev/null; then \
		echo "FibrexWatch worker is running (PID $$(cat api/run/fibrexwatch-worker.pid))"; \
	else \
		echo "FibrexWatch worker is not running"; \
	fi

worker-stop:
	@if [ -f api/run/fibrexwatch-worker.pid ] && kill -0 "$$(cat api/run/fibrexwatch-worker.pid)" 2>/dev/null; then \
		kill "$$(cat api/run/fibrexwatch-worker.pid)"; \
		echo "FibrexWatch worker stopped"; \
	else \
		echo "FibrexWatch worker is not running"; \
	fi
	@rm -f api/run/fibrexwatch-worker.pid

web:
	cd web && npm run dev

fmt:
	cd api && go fmt ./...
	cd web && npm run lint -- --fix

test:
	cd api && go test ./...
	cd web && npm run lint

build:
	@mkdir -p api/bin
	cd api && go build -o bin/fibrex-api ./cmd/server
	cd api && go build -o bin/fibrex-worker ./cmd/worker

precommit-install:
	pre-commit install

precommit:
	pre-commit run --all-files

backup:
	@mkdir -p backups
	@name="backups/fibrex-$$(date +%Y%m%d-%H%M%S).sql"; docker compose exec -T postgres pg_dump -U fibrex -d fibrex --clean --if-exists > "$$name" && echo "Backup written to $$name"

restore:
	@test -n "$(BACKUP)" || (echo "Usage: make restore BACKUP=backups/fibrex-YYYYMMDD-HHMMSS.sql" && exit 1)
	@test -f "$(BACKUP)" || (echo "Backup not found: $(BACKUP)" && exit 1)
	@docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U fibrex -d fibrex < "$(BACKUP)"
	@echo "Restored $(BACKUP)"
	cd web && npm run build
