# Deployment

This guide shows setup for local evaluation with docker compose.

## Current Runtime Requirements

The current API requires PostgreSQL and a pre-provisioned RabbitMQ broker. Set
`RABBITMQ_URL` and `RABBITMQ_EXCHANGE` in the API environment. The checked-in
Compose example below does not yet wire this mandatory broker; adapt it to an
external broker until the reference-stack ticket is implemented. Provision the
[jobs topology](job-queue.md#rabbitmq-topology) before starting the API.

Run **exactly one active API** because it owns the single outbox relay. Use
stop-before-start upgrades with no replica overlap. There is no separate relay
role or relay in workers. `SHUTDOWN_TIMEOUT_MS` defaults to 60 seconds; allow a
longer supervisor grace period (75 seconds with the default). A shutdown deadline
expiry forces nonzero exit. `STARTUP_TIMEOUT_MS` defaults to 30 seconds and bounds
required initialization, including migrations and broker setup.

Publication defaults to five attempts with a five-second retry delay. A broker
outage can exhaust those attempts; reconnecting does not revive failed jobs.
Explicit retry through the existing job service is required. Operator UI and
dead-letter reconciliation are not implemented. See the
[job queue lifecycle](job-queue.md#api-lifecycle-and-deployment) for details.

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

## Image Roles

One application image contains the API, bundled UI, and worker. Its default
command is `api`; omitting the role also selects API. Select a role with a single
argument after the image name, not an internal JavaScript path:

```bash
docker run --env-file api.env -p 3001:3001 ghcr.io/s-schoen/exposurenexus:edge
docker run --env-file api.env -p 3001:3001 ghcr.io/s-schoen/exposurenexus:edge api
docker run --env-file worker.env ghcr.io/s-schoen/exposurenexus:edge worker
```

These examples assume reachable PostgreSQL and pre-provisioned RabbitMQ. Supply
API configuration in `api.env`. The worker requires `DATABASE_URL` and
`RABBITMQ_URL` (with consumer credentials). `RABBITMQ_QUEUE` optionally overrides
the default `EXPOSURENEXUS_JOBS_INGEST` queue. It does not require or load API
authentication, origin, session, or static-serving configuration. See the
[worker configuration and lifecycle](../apps/worker/README.md). API migrations
must finish before starting the worker; the worker only checks migration status.

In Compose, use `command: ["api"]` or `command: ["worker"]` with the same image.
Reference-stack wiring is tracked separately. There is no environment-based role
selector or relay role. Unknown roles and extra arguments fail before either
application initializes.

The distroless, nonroot runtime needs no shell or package manager. The selected
application runs directly in the launcher Node process, receiving signals and
retaining its exit status. Allow 75 seconds for graceful container shutdown with
the default application deadline. The worker starts in connected idle mode,
without consuming jobs or serving HTTP; jobs accumulate until real handlers ship.

## Image Tags

The CI pipeline publishes `ghcr.io/s-schoen/exposurenexus:edge` from `master`.
Version tags are published from semver Git tags such as `v0.1.0`, which produces
`0.1.0`, `0.1`, `0`, and `latest`. Every published image also gets a
`sha-<shortsha>` tag.

To build a local image from the working tree instead, run:

```bash
docker build --target production -t exposurenexus:local .
```
