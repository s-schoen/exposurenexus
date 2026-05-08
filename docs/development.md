# Development

This document covers local development setup for ExposureNexus. The root README stays focused on product overview and quick evaluation.

## Prerequisites

- Node.js 24 LTS (`>=24.15.0 <25`)
- `pnpm` 10
- PostgreSQL 17, or Docker/Podman for the provided compose file

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
CORS_ORIGIN=http://localhost:3000
AUTH_COOKIE_SECURE=true
AUTH_SECRET=replace-with-a-random-secret-at-least-32-characters
AUTH_TRUSTED_PROXIES=
DATABASE_URL=postgres://postgres:postgres@localhost:5432/openvlp
```

If you use a different local database, update `DATABASE_URL` accordingly.

On first startup, the API runs database migrations automatically and creates a default admin user if the database is empty. The username is `admin`; the initial password is written to the API logs once.

## Configure The UI

The UI defaults to `http://localhost:3001` for the API. Create `apps/ui/.env` only if you need to override it:

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
│   ├── api/      # Hono API server, auth, database, imports
│   └── ui/       # React + Vite frontend
└── packages/
    └── types/    # Shared Zod schemas and TypeScript types
```

## Workspace Commands

Run repository-level checks from the workspace root:

```bash
pnpm lint
pnpm build
```

Useful workspace commands:

```bash
pnpm dev:api
pnpm dev:ui
pnpm --filter @exposurenexus/api test
pnpm --filter @exposurenexus/ui test
pnpm --filter @exposurenexus/ui storybook
```

## Technical Notes

ExposureNexus is implemented as a `pnpm` monorepo with three main workspaces:

- `apps/api` owns persistence, authentication, imports, and domain services.
- `apps/ui` provides the authenticated dashboard, assets, findings, vulnerabilities, triage, import, user, role, and custom field workflows.
- `packages/types` contains shared domain schemas and API contracts for assets, vulnerabilities, findings, users, roles, and permissions.

The current stack uses Hono for the API, PostgreSQL for storage, opaque server-side session authentication, and a React/Vite frontend with TanStack Router and TanStack Query.
