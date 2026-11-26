# Goldfin

## Local dev

Requires Docker, [portless](https://portless.sh), Go, pnpm, and a repo-root `.env` (`cp .env.example .env`).

```sh
make up    # postgres, migrate, api → https://api.goldfin.localhost
make run   # Vite via portless → https://<prefix>goldfin.localhost (branch/worktree prefix when applicable)
```

Postgres stays on `127.0.0.1:5432`. Set `API_URL=https://api.goldfin.localhost` in `.env` so the Vite `/api` proxy reaches the api container.

CI and `make check` do not use portless.