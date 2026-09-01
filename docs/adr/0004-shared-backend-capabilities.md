# Shared Backend Capabilities for API and Worker

ExposureNexus will move server-side business behavior and persistence from `apps/api` into one shared `@exposurenexus/backend` package. The API and future worker will be adapters over the same capability interfaces so business invariants, transaction boundaries, and database behavior have one owner without exposing repositories as a second interface.

## Decision

The backend package is one server-side module organized internally by domain. It owns business use cases, typed application errors, canonicalization and business validation, database table types, migrations, connection construction, private persistence adapters, and transaction boundaries. Authentication, sessions, users, roles, and permission resolution move with the other backend behavior; HTTP cookies and middleware remain in the API.

Callers use capability interfaces, never repositories or Kysely queries. The public capabilities are:

- `Identity`, with nested `users`, `roles`, and `authorization` interfaces;
- `Authentication`, for credentials and sessions;
- `Assets`, with nested `inventory` and `customFields` interfaces;
- `Exposures`, with nested `findings`, `vulnerabilities`, and `statistics` interfaces.

Capability construction is explicit and scoped through strict package subpaths:

```ts
const runtime = createBackendRuntime({ database, logger });

const identity = createIdentity(runtime);
const authentication = createAuthentication(runtime, authConfig);
const assets = createAssets(runtime);
const exposures = createExposures(runtime);
```

Each capability subpath owns its construction code. The opaque runtime owns the shared database and logger plus private per-runtime memoization, so the package root does not import or initialize every capability. Public exports are limited to capability interfaces and factories, caller-facing commands and results, domain-neutral mutation outcomes, configuration, database construction types, and backend errors. Repository contracts, dependency objects, lookup ports, persistence records, and transaction types remain private.

`@exposurenexus/backend/database` owns the aggregate database type, connection factory, migrations, and migration runner. Executable apps read environment variables, own the lifecycle of their database and pool, and pass the database handle into the selected capabilities. The API will continue to run migrations during startup for now; the worker will not. The backend package may depend narrowly on `@exposurenexus/jobs/postgres` for the jobs table contract and application migration, but queue producers, consumers, relays, handlers, and delivery policy remain in the executable apps and jobs package.

`@exposurenexus/contracts` remains backend-agnostic and client-safe. It may define TypeScript data structures and declarative Zod schemas for serialized shapes and primitive constraints, but it does not own business rules, canonicalization, database structures, backend commands, password-bearing records, or session persistence data. API routes and job handlers validate serialized shape; backend capabilities enforce business meaning and invariants.

Domain events remain API-owned because the worker does not need the API event system. Backend mutations return operation-specific, domain-neutral outcomes containing the safe before-and-after facts produced by the transaction. API-local capability decorators translate those outcomes into events and return the existing route-facing values; the worker consumes undecorated capabilities. This avoids duplicate reads and race windows without coupling the backend to API event definitions. Authentication session events use safe audit payloads containing non-secret session metadata rather than raw session tokens or persisted HMAC digests, and authentication success is emitted only after session creation succeeds.

API middleware continues to own user authentication and RBAC enforcement. Worker handlers are trusted system callers for now. Mutations that require audit attribution accept an explicit user ID rather than an HTTP, session, tenant, or generic execution context.

## Considered Alternatives

- **Share repositories but keep services in each app.** Rejected because API and worker code could duplicate or bypass validation, ordering, transaction, and error behavior.
- **Split application, persistence, or individual domains into separate workspace packages.** Rejected because there is one persistence adapter and existing projections and transactions cross findings and observations, assets and custom fields, and users, roles, and sessions. Separate packages would create shallow interfaces and dependency-cycle pressure without independent implementations.
- **Have the worker call the API.** Rejected because both apps are developed in sync and can share an in-process interface without adding a network seam.
- **Construct the entire backend eagerly.** Rejected because a worker using exposure capabilities should not need authentication secrets or session configuration.
- **Keep domain-event production in backend or reconstruct events with API-side database reads.** Rejected because events are currently an API concern, while extra reads would lose the transaction-produced snapshots and introduce races. Domain-neutral mutation outcomes preserve the required facts without making API events part of the backend interface.

## Consequences

The API will migrate completely to the backend capability interfaces, after which its old services, repositories, database modules, and compatibility exports are removed. Existing business behavior, HTTP contracts, and database schema remain unchanged except for the explicit authentication-event timing and payload hardening and removal of unsafe backend-only exports from `contracts`.

Business, persistence, transaction, and migration tests move with their implementation into the backend package. The API retains tests for HTTP adaptation, authorization middleware, cookies, event decorators, error translation, and composition. Typed `ApplicationError`s remain the shared failure identity, while the API continues to own HTTP status and safe-public-reason mapping as established by ADR-0001.

A future ingestion handler will validate and map its job, then call one high-level ingestion use case in `Exposures`. Matching, orchestration, and persistence will remain in backend rather than being implemented in the worker or through direct database access.
