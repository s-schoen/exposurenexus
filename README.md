# OpenVLP

OpenVLP is a vulnerability lifecycle platform for collecting, reviewing, and tracking security findings from multiple
sources. It gives teams a single place to import findings, organize affected assets, review vulnerabilities, and track
remediation work over time.

The platform currently supports:

- asset management
- a vulnerability catalog
- finding creation and lifecycle tracking
- dashboard and triage views
- importing findings from Nuclei JSONL exports
- username/password authentication

## What You Can Do With It

OpenVLP is built around a few core workflows:

- monitor overall exposure from the dashboard
- review active findings in a triage queue
- inspect assets and see where issues are concentrated
- browse the vulnerability catalog behind the findings
- import external findings and normalize them into the platform
- track finding status from discovery through mitigation

## Getting Started

To run OpenVLP locally you need Node.js, `pnpm`, and PostgreSQL.

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Start PostgreSQL:

3. Create `apps/api/.env`:

   ```env
   PORT=3001
   LOG_LEVEL=info
   API_TIMEOUT_MS=5000
   CORS_ORIGIN=http://localhost:3000
   AUTH_COOKIE_SECURE=true
   AUTH_SECRET=replace-with-a-random-secret-at-least-32-characters
   DATABASE_URL=postgres://postgres:postgres@localhost:5432/openvlp
   ```

4. Optional: create `apps/ui/.env` if you want to override the default API URL:

   ```env
   VITE_API_URL=http://localhost:3001
   ```

5. Start the backend and frontend in separate terminals:

   ```bash
   pnpm dev:api
   pnpm dev:ui
   ```

6. Open `http://localhost:3000`.

On first startup, the API runs database migrations automatically and creates a default admin user if the database is
empty. The initial password is written to the API logs once, and the username is `admin`.

## Repository Layout

```text
.
├── apps/
│   ├── api/      # Hono API server, auth, database, imports
│   └── ui/       # React + Vite frontend
├── packages/
    └── types/    # Shared Zod schemas and TypeScript types
```

## Prerequisites

- Node.js 20+
- `pnpm` 10
- PostgreSQL 17, or Docker/Podman to run the provided compose file

## Development Workflow

Run the normal repository-level checks from the workspace root:

```bash
pnpm lint
pnpm build
```

Useful workspace commands:

```bash
pnpm dev:api
pnpm dev:ui
pnpm --filter @openvlp/api test
pnpm --filter @openvlp/ui test
```

## Technical Notes

OpenVLP is implemented as a `pnpm` monorepo with three main workspaces:

- `apps/api` owns persistence, auth, imports, and domain services
- `apps/ui` provides the dashboard, assets, findings, vulnerabilities, triage, and import screens
- `packages/types` contains the shared domain schemas for assets, vulnerabilities, findings, and API contracts

The current stack uses Hono for the API, PostgreSQL for storage, custom opaque-session authentication, and a
React/Vite frontend with TanStack Router and TanStack Query.

## License

MIT
