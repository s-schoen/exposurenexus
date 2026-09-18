# Development

This document covers local development setup for ExposureNexus. The root README stays focused on product overview and quick evaluation.

## Prerequisites

- Node.js 24 LTS (`>=24.15.0 <25`)
- `pnpm` 11.21.0
- PostgreSQL, or Docker with Compose for the provided PostgreSQL 18 stack
- RabbitMQ with the [jobs topology](job-queue.md#rabbitmq-topology) provisioned
- Private S3-compatible storage, or the existing Compose VersityGW service

Always use `pnpm` for workspace commands.

## Install Dependencies

```bash
pnpm install
```

## Start Infrastructure

Create the ignored root `.env` with the required broker and storage variables from
[deployment configuration](deployment.md#compose-configuration). Compose requires
these values even when selecting infrastructure only. Root broker URLs use host
`rabbitmq`; local application URLs use `localhost` instead.

The consolidated `deployment/docker/docker-compose.yaml` binds PostgreSQL `5432`,
AMQP `5672`, and the VersityGW S3 API `7070` to `127.0.0.1` only. No development
override is required.
Run from the repository root, in order:

```bash
docker compose --env-file .env -f deployment/docker/docker-compose.yaml stop -t 75 worker app
docker compose --env-file .env -f deployment/docker/docker-compose.yaml up -d --wait postgres rabbitmq s3
docker compose --env-file .env -f deployment/docker/docker-compose.yaml run --rm rabbitmq-init
docker compose --env-file .env -f deployment/docker/docker-compose.yaml run --rm init-s3
```

Check that both one-shot init commands exit **zero** before starting the local API.
Broker health alone is insufficient. `init-s3` checks for the configured private
bucket and creates it if absent. On failure, correct the configuration or
provisioning problem and rerun the failed init; do not continue or delete volumes.

Only PostgreSQL, RabbitMQ, S3, and their init services run in containers for local
development. Never run an unqualified Compose `up` alongside the local API: it starts a second API and
outbox relay. Explicit `stop` also prevents old `unless-stopped` application
containers from auto-restarting. Stop any other local API using this database too.

The reference database is `exposurenexus`, user `exposurenexus`, password `change-me`.
RabbitMQ management remains internal to the Compose network.

## Configure The API

Create ignored `apps/api/.env` using these non-secret placeholders:

```env
PORT=3001
LOG_LEVEL=info
API_TIMEOUT_MS=5000
APP_ORIGIN=http://localhost:3000
STATIC_DIR=
AUTH_COOKIE_SECURE=true
AUTH_SECRET=replace-with-a-random-secret-at-least-32-characters
AUTH_TRUSTED_PROXIES=
DATABASE_URL=postgres://exposurenexus:change-me@localhost:5432/exposurenexus
RABBITMQ_URL=amqp://api-publisher:replace-with-api-password@localhost:5672/exposurenexus
RABBITMQ_EXCHANGE=EXPOSURENEXUS_JOBS
S3_BUCKET=exposurenexus
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=replace-with-local-s3-access-key
S3_SECRET_ACCESS_KEY=replace-with-local-s3-secret
S3_ENDPOINT=http://localhost:7070
S3_FORCE_PATH_STYLE=true
IMPORT_SOURCE_MAX_SIZE_BYTES=104857600
IMPORT_SOURCE_RETENTION_POLICY=temporary
IMPORT_SOURCE_UPLOAD_TIMEOUT_MS=300000
STARTUP_TIMEOUT_MS=30000
SHUTDOWN_TIMEOUT_MS=60000
```

`APP_ORIGIN` is the browser origin allowed by CORS and CSRF Origin checks. Use
the public application origin in deployed environments. `CORS_ORIGIN` is still
accepted as a deprecated alias when `APP_ORIGIN` is not set.

Leave `STATIC_DIR` unset for split local development. Set it to a built UI
asset directory when the API process should also serve the React app.

If you use a different local database, update `DATABASE_URL` accordingly.

Use the same bucket, region, and static S3 credentials as the root Compose `.env`.
Only the endpoint changes from Compose's `http://s3:7070` to
`http://localhost:7070`. The four bucket/region/credential variables are required
and nonblank. Path-style addressing is `true` for this local gateway, overriding
the application default of `false`. See [API and worker storage configuration](deployment.md#api-and-worker-storage-configuration)
for optional settings, validation, and non-local storage requirements.

Storage configuration is validated at API startup, without a connectivity or bucket
probe. A healthy API therefore does not establish S3 reachability or permissions.
The API owns the storage client and closes it after HTTP, tracked upload work, and
relay settlement and on startup failure. Upload work is tracked even after its
socket closes, cancelled and awaited during bounded shutdown before storage or
database closure. Configure worker storage below against the same bucket, endpoint,
and account; bucket-name equality alone cannot establish endpoint/account continuity.

`IMPORT_SOURCE_UPLOAD_TIMEOUT_MS` is a positive bounded integer with a five-minute
default. Only the raw-byte PUT uses it; registration and ordinary requests retain
`API_TIMEOUT_MS=5000`. Deadline or disconnection aborts the transfer, awaits its
settlement, and prevents submission that has not begun. The HTTP server uses the
upload deadline plus the default `60000` ms header budget for `requestTimeout`, while `headersTimeout` keeps
its existing default. See [upload deadlines and recovery](deployment.md#upload-deadlines-and-recovery).

On first startup, the API runs backend-owned database migrations automatically and creates a default admin user if the database is empty. The username is `admin`; the initial password is written to the API logs once.

RabbitMQ is required even before automated ingestion is available. Supply your
broker URL and provision the exchange before starting the API. Missing broker resources
or an initial connection failure fail API startup. The API continuously runs one
outbox relay; do not run overlapping API processes against the same database.
See [API lifecycle and deployment](job-queue.md#api-lifecycle-and-deployment) for
deadline, shutdown, and finite publication-retry behavior.

## Configure The Worker

Create ignored `apps/worker/.env`:

```env
DATABASE_URL=postgres://exposurenexus:change-me@localhost:5432/exposurenexus
RABBITMQ_URL=amqp://worker-consumer:replace-with-worker-password@localhost:5672/exposurenexus
RABBITMQ_QUEUE=EXPOSURENEXUS_JOBS_INGEST
S3_BUCKET=exposurenexus
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=replace-with-local-s3-access-key
S3_SECRET_ACCESS_KEY=replace-with-local-s3-secret
S3_ENDPOINT=http://localhost:7070
S3_FORCE_PATH_STYLE=true
LOG_LEVEL=info
STARTUP_TIMEOUT_MS=30000
SHUTDOWN_TIMEOUT_MS=60000
```

Replace these non-secret password placeholders. Each local application's URL must
match its distinct provisioned account in the root `.env`, not the administrator
or a shared account. Percent-encode username/password URL components (for example,
`@` as `%40`), but keep provisioner credential inputs unencoded. Worker needs no
API authentication or UI configuration. Its migration checks are read-only and
fail if required migrations are missing, including outside Compose.

The four bucket/region/credential variables are required and nonblank, matching
the API's storage account and bucket. `S3_ENDPOINT` and `S3_FORCE_PATH_STYLE` are
optional with the same semantics as the API; the local gateway needs the values
above. The worker uses the existing storage factory, with no storage connectivity
or bucket probe at startup. It needs no API upload-policy variables. It closes
storage on startup failure and after accepted reads drain on normal shutdown,
never while those reads are active. If drain fails or hangs, bounded nonzero exit
and unacknowledged redelivery remain unchanged.

## Configure The UI

The UI defaults to same-origin API calls under `/api`, which matches the
single-container production layout. For split local development with Vite on
port `3000` and the API on port `3001`, create `apps/ui/.env`:

```env
VITE_API_URL=http://localhost:3001
```

## Run The App

After successful init, start the API in its own terminal:

```bash
pnpm dev:api
```

Wait for API startup and migrations to complete; verify
`curl --fail http://localhost:3001/api/health` succeeds. Start the worker in a second terminal:

```bash
pnpm dev:worker
```

Start the UI in a third terminal:

```bash
pnpm dev:ui
```

Open `http://localhost:3000`.

The UI import page remains disabled. Authenticated API callers can
[register immutable scan-upload metadata](import-sources.md#register-a-scan-upload),
then [upload raw bytes once](import-sources.md#upload-and-submit) as that creator
with current `import:write` permission and CSRF protection. Registration alone
creates no bytes, ingestion, or job. Upload returns `202` with
`{ importSourceId, ingestionId, jobId }` only after durable storage and atomic
submission, not processed results or imported observations. Unused registrations
never expire, but claimed IDs are never reusable, even after failure or cancellation.
Recovery requires a new registration and upload; an ambiguous response can mean a
separate, duplicate submission. Durably available input is preserved after later
abort or submission failure, with its safe source ID logged for diagnosis.

The complete real ingestion handler set activates worker consumption automatically,
without a flag. The handler calls backend `Ingestions.process(ingestionId)` to
stream the entire stored input to discard, then logs `ingestion shell completed`
with `jobId`, `ingestionId`, `importSourceId`, and `bytesRead`. It never parses
zero-byte or malformed contents, creates observations, writes database state, or
deletes input, even under `temporary` retention. Execution deliberately stays
`pending`; duplicate deliveries safely repeat reads and logs. Retained inputs and
abandoned registrations accumulate until cleanup exists or is explicitly performed.
Scanner parsing is not implemented and the shell does not translate or match input.

Use the [existing-stack smoke check](deployment.md#ingestion-shell-smoke-check) to
verify the real handoff and log-only observability. A running worker has no HTTP
health endpoint and does not prove successful storage access. Parsing, matching,
observation/finding persistence, execution-state orchestration, and cleanup remain
deferred.

For graceful shutdown, press Ctrl+C in worker and API terminals and wait for cleanup
and process exit before restarting either. Stop the UI with Ctrl+C too. SIGINT and
SIGTERM drain within the default 60-second deadline; expiry exits nonzero. Only then
stop infrastructure:

```bash
docker compose --env-file .env -f deployment/docker/docker-compose.yaml stop postgres rabbitmq s3
```

This preserves data; do not use `down -v` or delete volumes. See
[deployment operations](deployment.md#updates-scaling-and-shutdown) for container updates and replicas.

## Repository Layout

```text
.
├── apps/
│   ├── api/      # Hono HTTP adapters and executable composition
│   ├── worker/   # Jobs consumer and read-only ingestion shell adapter
│   └── ui/       # React + Vite frontend
└── packages/
    ├── backend/  # Business capabilities, persistence, migrations
    ├── contracts/ # Client-safe schemas and API types
    └── jobs/     # Job model, outbox, relay, and queue transport
```

## Workspace Commands

Run repository-level checks from the workspace root:

```bash
pnpm lint
pnpm format:check
pnpm build
```

`pnpm lint` runs Oxlint with the root baseline and nested workspace configurations,
with type-aware checks. `pnpm format:check` verifies the root Oxfmt configuration.
Use `pnpm format` to apply formatting changes.

`@exposurenexus/contracts` exports its built `dist` files. `pnpm build` uses pnpm's
recursive workspace execution, which runs dependencies before dependents.
Focused root scripts use pnpm's dependency filter, such as
`@exposurenexus/api^...`, to build workspace dependencies before running the
package-local command.

Run focused checks through the root scripts below. Direct package commands such
as `pnpm --filter @exposurenexus/api test` assume all workspace dependencies
(including backend, contracts, and jobs) have already been built. When editing shared contracts while a dev server is already running, rebuild
the package with `pnpm --filter @exposurenexus/contracts build` before restarting
the dependent API or UI process.

Useful workspace commands:

```bash
pnpm dev:api
pnpm dev:ui
pnpm test:api
pnpm test:ui
pnpm storybook:ui
```

## Technical Notes

ExposureNexus is implemented as a `pnpm` monorepo with these workspaces:

- `apps/api` owns HTTP adaptation, cookies, middleware, API events, and startup.
- `apps/worker` owns worker startup, read-only migration checks, and consumer lifecycle.
- `packages/backend` owns business capabilities, authentication, identity/RBAC,
  persistence, transactions, and migrations.
- `packages/jobs` provides the job model, outbox persistence, relay, and queue transport.
- `apps/ui` provides the authenticated dashboard, assets, findings, vulnerabilities, triage, import, user, role, and custom field workflows.
- `packages/contracts` contains shared domain schemas and API contracts for assets, vulnerabilities, findings, users, roles, and permissions.

The current stack uses Hono for the API, PostgreSQL for storage, opaque server-side session authentication, and a React/Vite frontend with TanStack Router and TanStack Query.

API adapter and shared backend capability conventions are documented in
[API Architecture](api-architecture.md).
