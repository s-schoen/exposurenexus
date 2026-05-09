# Deployment

This guide shows setup for local evaluation with docker compose.

## Start The Compose Stack

The repository includes a Docker Compose file that pulls the public image
from GitHub Container Registry and starts PostgreSQL:

```bash
docker compose up
```

The image serves the React UI and Hono API from one container. API routes remain
under `/api`; all other browser navigation paths are served by the built UI.

Open `http://localhost:3001`.

Before deploying beyond local evaluation, edit `docker-compose.yaml` and replace
`AUTH_SECRET` and the PostgreSQL password values. Keep `DATABASE_URL` in sync
with the PostgreSQL service credentials. Set `APP_ORIGIN` to the browser-facing
origin users will load in their browser.

## Image Tags

The CI pipeline publishes `ghcr.io/s-schoen/exposurenexus:edge` from `master`.
Version tags are published from semver Git tags such as `v0.1.0`, which produces
`0.1.0`, `0.1`, `0`, and `latest`. Every published image also gets a
`sha-<shortsha>` tag.

To build a local image from the working tree instead, run:

```bash
docker build --target production -t exposurenexus:local .
```
