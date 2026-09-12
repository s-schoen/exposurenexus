# Deployment

This guide shows setup for local evaluation with docker compose.

## Current Runtime Requirements

Both applications require PostgreSQL and initialized RabbitMQ. The consolidated
`deployment/docker/docker-compose.yaml` includes `postgres`, `rabbitmq`, one-shot
`rabbitmq-init`, `app` (API and UI), `worker`, `s3`, and one-shot `init-s3`.
Both roles wait for healthy PostgreSQL and RabbitMQ and successful init completion;
failed provisioning blocks startup. Worker additionally waits for `app` health after
API initialization and migrations. This is startup coordination, not an ongoing API
dependency or callback. Worker migration checks remain read-only and authoritative
outside Compose too; workers never apply migrations.

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

## Compose Configuration

Create an ignored root `.env` (or pass a private `--env-file` before each Compose
subcommand) with all eight required variables. These non-secret placeholders must
be replaced with independent strong passwords:

```env
RABBITMQ_PROVISIONER_USER=topology-admin
RABBITMQ_PROVISIONER_PASSWORD=replace-with-provisioner-password
RABBITMQ_API_USER=api-publisher
RABBITMQ_API_PASSWORD=replace-with-api-password
RABBITMQ_WORKER_USER=worker-consumer
RABBITMQ_WORKER_PASSWORD=replace-with-worker-password
RABBITMQ_API_URL=amqp://api-publisher:replace-with-api-password@rabbitmq:5672/exposurenexus
RABBITMQ_WORKER_URL=amqp://worker-consumer:replace-with-worker-password@rabbitmq:5672/exposurenexus
```

The last two values are **full URLs**, using the respective provisioned credentials,
host `rabbitmq`, and vhost `exposurenexus`. Percent-encode username/password URL
components (for example, `@` as `%40` and `#` as `%23`), not the entire URL or the
six provisioner credential inputs. Single-quote env-file values containing `$` to
avoid interpolation. Never commit secrets or print rendered configuration with them.

The six existing credential variables configure provisioning. Compose maps each
role's URL to its own `RABBITMQ_URL`: publisher credentials for API, consumer
credentials for worker, never administrator credentials. Both roles receive the
application database; only `app` receives API-specific configuration. See
[provisioning details](job-queue.md#reference-initialization) for account restrictions,
repeatability, and safe credential rotation on existing volumes.

## Start The Compose Stack

Both `app` and `worker` select their application entrypoint paths using the same
`${APP_IMAGE:-ghcr.io/s-schoen/exposurenexus:edge}` image. Optionally set `APP_IMAGE`
in root `.env` to a release tag or digest for both roles. Validate without printing
secrets, then start from the repository root:

```bash
docker compose -f deployment/docker/docker-compose.yaml config --quiet
docker compose -f deployment/docker/docker-compose.yaml up -d --wait
docker compose -f deployment/docker/docker-compose.yaml ps -a
docker compose -f deployment/docker/docker-compose.yaml logs rabbitmq-init app worker
```

The image serves the React UI and Hono API from one container. API routes remain
under `/api`; all other browser navigation paths are served by the built UI.

Open `http://localhost:3001`.

Confirm init exited zero and `app` is healthy. Worker is a normal connected idle
service, not opt-in. It has no subscription, HTTP endpoint, healthcheck command,
status file, or Compose healthcheck. Monitor structured lifecycle logs and process
exit status; a running process does not imply processing readiness. Jobs accumulate
until a complete real handler set ships and enables consumption automatically,
without an operator flag. Real ingestion, execution-state orchestration, and
business idempotency remain future work.

Both applications use `restart: unless-stopped` for unexpected exits and a
75-second stop grace period around the default 60-second application deadline.
Init remains one-shot with `restart: "no"`. Application security hardening retains
the nonroot image, read-only filesystem, dropped capabilities, and no-new-privileges.
PostgreSQL `5432` and RabbitMQ AMQP `5672` are published on `127.0.0.1` only for
[host development](development.md#start-infrastructure); management remains internal.

Before deploying beyond local evaluation, edit `deployment/docker/docker-compose.yaml` and replace
`AUTH_SECRET` and the PostgreSQL password values. Keep `DATABASE_URL` in sync
with the PostgreSQL service credentials. Set `APP_ORIGIN` to the browser-facing
origin users will load in their browser.

## Image Roles

One application image contains the API, bundled UI, and worker. Its default
command starts the API and bundled UI. To explicitly select an application, pass
its compiled entrypoint path after the image name:

```bash
docker run --env-file api.env -p 3001:3001 ghcr.io/s-schoen/exposurenexus:edge
docker run --env-file api.env -p 3001:3001 ghcr.io/s-schoen/exposurenexus:edge /app/apps/api/dist/src/index.js
docker run --env-file worker.env ghcr.io/s-schoen/exposurenexus:edge /app/apps/worker/dist/src/index.js
```

These examples assume reachable PostgreSQL and pre-provisioned RabbitMQ. Supply
API configuration in `api.env`. The worker requires `DATABASE_URL` and
`RABBITMQ_URL` (with consumer credentials). `RABBITMQ_QUEUE` optionally overrides
the default `EXPOSURENEXUS_JOBS_INGEST` queue. It does not require or load API
authentication, origin, session, or static-serving configuration. See the
[worker configuration and lifecycle](../apps/worker/README.md). API migrations
must finish before starting the worker; the worker only checks migration status.

In Compose, `app` uses `command: [/app/apps/api/dist/src/index.js]` and `worker`
uses `command: [/app/apps/worker/dist/src/index.js]` with the same image.
There is no role launcher, environment-based role selector, or relay role.

The distroless, nonroot runtime contains no shell or package manager. Node runs
the selected application directly as PID 1, receiving signals and
retaining its exit status. Allow 75 seconds for graceful container shutdown with
the default application deadline. The worker starts in connected idle mode,
without consuming jobs or serving HTTP; jobs accumulate until real handlers ship.

## Updates, Scaling, And Shutdown

Never scale `app` above one or use rolling API updates. For an application-image
update, set the new `APP_IMAGE` if needed, then run in order:

```bash
docker compose -f deployment/docker/docker-compose.yaml pull app worker
docker compose -f deployment/docker/docker-compose.yaml stop -t 75 worker app
docker compose -f deployment/docker/docker-compose.yaml up -d --no-deps --wait app
docker compose -f deployment/docker/docker-compose.yaml up -d --no-deps worker
```

Proceed only if each command succeeds. These commands assume healthy infrastructure
and successful provisioning; reconcile init separately if its configuration changed.
Explicit Compose `stop` waits for old processes and marks them stopped so
`unless-stopped` cannot restart the old API. Do not just signal or kill an
auto-restarting container and start its replacement elsewhere. Wait for old API
exit before any replacement, including local processes or another Compose project.
The new API must become healthy and finish migrations before workers start.

Once the stack is healthy, scale workers without touching dependencies or the API:

```bash
docker compose -f deployment/docker/docker-compose.yaml up -d --no-deps --scale worker=3 worker
docker compose -f deployment/docker/docker-compose.yaml logs -f worker
```

Workers have no fixed container names, published ports, or relay per replica. Use
the same command with `worker=1` to scale down. Scaling idle workers does not enable
ingestion. `--no-deps` bypasses startup gates: use it only after verifying infrastructure,
provisioning, and API initialization.

For graceful shutdown, stop applications before their dependencies:

```bash
docker compose -f deployment/docker/docker-compose.yaml stop -t 75 worker app
docker compose -f deployment/docker/docker-compose.yaml stop postgres rabbitmq s3
```

SIGTERM (containers) or Ctrl+C/SIGINT (terminals) stops new work and drains active
work before connections close. Wait for exit; deadline expiry is nonzero and
unfinished deliveries are not acknowledged. If increasing `SHUTDOWN_TIMEOUT_MS`,
increase supervisor grace beyond it too. These commands preserve PostgreSQL and
RabbitMQ data. Do not use `down -v` or delete volumes for updates, shutdown, or
provisioning failures.

## Image Tags

The CI pipeline publishes `ghcr.io/s-schoen/exposurenexus:edge` from `master`.
Version tags are published from semver Git tags such as `v0.1.0`, which produces
`0.1.0`, `0.1`, `0`, and `latest`. Every published image also gets a
`sha-<shortsha>` tag.

To build a local image from the working tree instead, run:

```bash
docker build --target production -t exposurenexus:local .
```
