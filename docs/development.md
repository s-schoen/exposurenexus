# Development

This document covers local development setup for ExposureNexus. The root README stays focused on product overview and quick evaluation.

## Prerequisites

- Node.js 24 LTS (`>=24.15.0 <25`)
- `pnpm` 11.21.0
- PostgreSQL 17, or Docker/Podman for the provided compose file
- RabbitMQ with the [jobs topology](job-queue.md#rabbitmq-topology) provisioned

Always use `pnpm` for workspace commands.

## Install Dependencies

```bash
pnpm install
```

## Start PostgreSQL

A development compose file is available at `.dev/docker-compose.yaml`:

```bash
docker compose -f .dev/docker-compose.yaml up -d
```

The compose file currently starts PostgreSQL 17 on port `5432` with password `postgres` and database `openvlp`.

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
DATABASE_URL=postgres://postgres:postgres@localhost:5432/openvlp
RABBITMQ_URL=amqp://api-publisher:replace-with-password@localhost:5672/exposurenexus
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
broker URL and provision the exchange before starting the API; the development
Compose file above currently provides only PostgreSQL. Missing broker resources
or an initial connection failure fail API startup. The API continuously runs one
outbox relay; do not run overlapping API processes against the same database.
See [API lifecycle and deployment](job-queue.md#api-lifecycle-and-deployment) for
deadline, shutdown, and finite publication-retry behavior. Reference broker and
Compose wiring is a separate worker-runtime ticket.

## Configure The UI

The UI defaults to same-origin API calls under `/api`, which matches the
single-container production layout. For split local development with Vite on
port `3000` and the API on port `3001`, create `apps/ui/.env`:

```env
VITE_API_URL=http://localhost:3001
```

## Run The App

Start the backend and frontend in separate terminals:

```bash
pnpm dev:api
pnpm dev:ui
```

Open `http://localhost:3000`.

## Repository Layout

```text
.
├── apps/
│   ├── api/      # Hono HTTP adapters and executable composition
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
- `packages/backend` owns business capabilities, authentication, identity/RBAC,
  persistence, transactions, and migrations.
- `packages/jobs` provides the job model, outbox persistence, relay, and queue transport.
- `apps/ui` provides the authenticated dashboard, assets, findings, vulnerabilities, triage, import, user, role, and custom field workflows.
- `packages/contracts` contains shared domain schemas and API contracts for assets, vulnerabilities, findings, users, roles, and permissions.

The current stack uses Hono for the API, PostgreSQL for storage, opaque server-side session authentication, and a React/Vite frontend with TanStack Router and TanStack Query.

API adapter and shared backend capability conventions are documented in
[API Architecture](api-architecture.md).
