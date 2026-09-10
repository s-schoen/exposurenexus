# Development

This document covers local development setup for ExposureNexus. The root README stays focused on product overview and quick evaluation.

## Prerequisites

- Node.js 24 LTS (`>=24.15.0 <25`)
- `pnpm` 11.21.0
- PostgreSQL, or Docker with Compose for the provided PostgreSQL 18 stack
- RabbitMQ with the [jobs topology](job-queue.md#rabbitmq-topology) provisioned

Always use `pnpm` for workspace commands.

## Install Dependencies

```bash
pnpm install
```

## Start Infrastructure

Create the ignored root `.env` with all eight variables from
[deployment configuration](deployment.md#compose-configuration). Compose requires
the two full application URLs even when selecting infrastructure only. Root URLs
use host `rabbitmq`; local application URLs use `localhost` instead.

The checked-in `docker-compose.dev.yaml` reuses root infrastructure and binds
PostgreSQL `5432`, AMQP `5672`, and management `15672` to `127.0.0.1` only.
No private `.dev` stack is required. Run from the repository root, in order:

```bash
docker compose -f docker-compose.yaml -f docker-compose.dev.yaml stop -t 75 worker app
docker compose -f docker-compose.yaml -f docker-compose.dev.yaml up -d --wait postgres rabbitmq
docker compose -f docker-compose.yaml -f docker-compose.dev.yaml run --rm rabbitmq-init
```

Check that the one-shot init command exits **zero** before starting the local API.
Broker health alone is insufficient. On failure, correct the reported configuration
or topology problem and rerun init; do not continue or delete volumes.

Only PostgreSQL, RabbitMQ, and init run in containers for local development. Never
run an unqualified Compose `up` alongside the local API: it starts a second API and
outbox relay. Explicit `stop` also prevents old `unless-stopped` application
containers from auto-restarting. Stop any other local API using this database too.

The reference database is `exposurenexus`, user `exposurenexus`, password `change-me`.
Management is at `http://localhost:15672` using the provisioner account, not an
application account.

## Configure The API

Create `apps/api/.env`:

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
STARTUP_TIMEOUT_MS=30000
SHUTDOWN_TIMEOUT_MS=60000
```

`APP_ORIGIN` is the browser origin allowed by CORS and CSRF Origin checks. Use
the public application origin in deployed environments. `CORS_ORIGIN` is still
accepted as a deprecated alias when `APP_ORIGIN` is not set.

Leave `STATIC_DIR` unset for split local development. Set it to a built UI
asset directory when the API process should also serve the React app.

If you use a different local database, update `DATABASE_URL` accordingly.

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

Worker is intentionally connected but idle without a subscription. Logs and exit
status describe process availability, not processing readiness. Jobs accumulate
until a complete real handler set ships and activates consumption automatically.
Real ingestion, execution-state orchestration, and business idempotency remain future work.

For graceful shutdown, press Ctrl+C in worker and API terminals and wait for cleanup
and process exit before restarting either. Stop the UI with Ctrl+C too. SIGINT and
SIGTERM drain within the default 60-second deadline; expiry exits nonzero. Only then
stop infrastructure:

```bash
docker compose -f docker-compose.yaml -f docker-compose.dev.yaml stop postgres rabbitmq
```

This preserves data; do not use `down -v` or delete volumes. See
[deployment operations](deployment.md#updates-scaling-and-shutdown) for container updates and replicas.

## Repository Layout

```text
.
├── apps/
│   ├── api/      # Hono HTTP adapters and executable composition
│   ├── worker/   # Connected jobs runtime, initially idle
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
