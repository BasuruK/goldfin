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

`docker-compose.yml` sets `name: goldfin`, so Postgres data lives in `goldfin_goldfin-pgdata`, not `<checkout-dir>_goldfin-pgdata`.
If you used a directory-named project before, run `docker compose -p <old-dir> down` first so `127.0.0.1:5432` is free, then either keep using that volume name or copy the data into `goldfin_goldfin-pgdata` before `make up`.

CI and `make check` do not use portless.