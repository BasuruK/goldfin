# Goldfin

## Local dev

Requires Docker, [portless](https://portless.sh), Go, pnpm, and a repo-root `.env`.

```sh
cp .env.example .env
# Set POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, and APP_KEY before make up.
# APP_KEY is standard base64 for 32 random bytes (Credential encryption); e.g.:
#   APP_KEY=$(openssl rand -base64 32)
pnpm install --frozen-lockfile
make up    # postgres, migrate, api → https://api.goldfin.localhost
make run   # Vite via portless → https://<prefix>goldfin.localhost (branch/worktree prefix when applicable)
```

Postgres stays on `127.0.0.1:5432`. Set `API_URL=https://api.goldfin.localhost` in `.env` so the Vite `/api` proxy reaches the api container.

`docker-compose.yml` sets `name: goldfin`, so the Postgres data volume is always `goldfin_goldfin-pgdata`, not `<checkout-dir>_goldfin-pgdata`. If you already have data under an older directory-named volume, stop the stack and copy or reattach that volume before relying on the new name.

CI and `make check` do not use portless.