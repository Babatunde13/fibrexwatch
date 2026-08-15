# User administration command

`users` manages FibreXWatch login accounts directly in PostgreSQL. It is deliberately separate from API startup: starting the application never creates or changes an account automatically.

## Native usage

From the repository root:

```sh
make create-user
make create-user USERNAME=friend
make list-users
make reset-password
make reset-password USERNAME=friend
make disable-user USERNAME=friend
```

Usernames are prompted for when omitted. Passwords are read from an interactive terminal without echoing and are stored as bcrypt hashes. Passwords are never accepted through command arguments or environment variables.

## Docker usage

The API image also contains the administration binary:

```sh
docker compose run --rm --entrypoint /app/fibrex-users api create
docker compose run --rm --entrypoint /app/fibrex-users api list
docker compose run --rm --entrypoint /app/fibrex-users api reset-password
docker compose run --rm --entrypoint /app/fibrex-users api disable --username friend
```

Run migrations first with `docker compose up -d postgres redis` followed by `docker compose run --rm migrate`, or start the full stack once. Creating a user requires an interactive terminal. Resetting a password or disabling an account increments that account's authentication version, immediately invalidating all of its Redis sessions.
