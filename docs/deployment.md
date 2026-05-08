# Deployment

This guide shows setup for local evaluation with docker compose.

## Start The Compose Stack

The repository includes a Docker Compose file that builds the production app
image and starts PostgreSQL:

```bash
docker compose up --build
```

The image serves the React UI and Hono API from one container. API routes remain
under `/api`; all other browser navigation paths are served by the built UI.

Open `http://localhost:3001`.

Before deploying beyond local evaluation, edit `docker-compose.yaml` and replace
`AUTH_SECRET` and the PostgreSQL password values. Keep `DATABASE_URL` in sync
with the PostgreSQL service credentials. Set `APP_ORIGIN` to the browser-facing
origin users will load in their browser.