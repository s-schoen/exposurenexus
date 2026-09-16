# Shared Backend Capabilities for API and Worker

ExposureNexus will move server-side business behavior and persistence from `apps/api` into one shared `@exposurenexus/backend` package. The API and future worker will be adapters over the same capability interfaces so business invariants, transaction boundaries, and database behavior have one owner without exposing repositories as a second interface.

## Decision

The backend package is one server-side module organized internally by domain. It owns business use cases, typed application errors, canonicalization and business validation, database table types, migrations, connection construction, private persistence adapters, and transaction boundaries. Authentication, sessions, users, roles, and permission resolution move with the other backend behavior; HTTP cookies and middleware remain in the API.

Callers use capability interfaces, never repositories or Kysely queries. The public capabilities are:

- `Identity`, with nested `users`, `roles`, and `authorization` interfaces;
- `Authentication`, for credentials and sessions;
- `Assets`, with nested `inventory` and `customFields` interfaces;
- `Findings`, for findings, their observations, and vulnerability links;
- `Vulnerabilities`, for the vulnerability catalog;
- `Statistics`, for finding statistics;
- `ImportSources`, for registration, one-shot upload, stored input, and provenance;
- `Ingestions`, for durable submission after upload and a read-only processing shell.

Capability construction is explicit and scoped through strict package subpaths:

```ts
const runtime = createBackendRuntime({ database, logger });

const identity = createIdentity(runtime);
const authentication = createAuthentication(runtime, authConfig);
const assets = createAssets(runtime);
const findings = createFindings(runtime);
const vulnerabilities = createVulnerabilities(runtime);
const statistics = createStatistics(runtime);
const importSources = createImportSources(runtime, storage, importPolicy);
const ingestions = createIngestions(runtime, importSources);
```

Each capability subpath owns its construction code. The opaque runtime owns the shared database and logger plus private per-runtime memoization, so the package root does not import or initialize every capability. Public exports are limited to capability interfaces and factories, caller-facing commands and results, domain-neutral mutation outcomes, configuration, database construction types, and backend errors. Repository contracts, dependency objects, lookup ports, persistence records, and transaction types remain private.

### Feature Organization Refinement

The initial extraction grouped findings, vulnerabilities, and statistics behind an `Exposures` interface. This grouping is replaced by independent `/findings`, `/vulnerabilities`, and `/statistics` entrypoints so callers select the feature they need and the public interfaces match implementation ownership. The old `/exposures` entrypoint and aggregate are removed; the API composes and decorates the features separately. Identity retains its users, roles, and authorization subfeatures, and assets retains inventory and custom fields.

Implementation lives under `src/features/`, colocating feature behavior, private persistence, table types, errors, rules, and tests. Findings retain observations and finding-vulnerability link mutations because they share transactions, projections, and audit updates. Shared asset projections and audit handling stay at the assets level. Existing cross-feature persistence dependencies remain private and transaction-aware; independent entrypoints do not require isolated databases or new repository interfaces.

Database and application-error modules aggregate feature-owned types through type-only imports. Migration history remains centralized. Ingestion owns submission and the read-only processing shell through its strict `/ingestions` entrypoint. The earlier feature split was an organizational and caller-interface change, not a change to business behavior, HTTP contracts, or persistence semantics.

### Shared Infrastructure And Adapters

`@exposurenexus/backend/database` owns the aggregate database type, connection factory, migrations, and migration runner. Executable apps read environment variables, own the lifecycle of their database and pool, and pass the database handle into the selected capabilities. The API will continue to run migrations during startup for now; the worker will not.

The backend package's narrow jobs allowance includes the event contract from `@exposurenexus/jobs`, `JobService` from `@exposurenexus/jobs/service`, and the table and transactional persistence contracts from `@exposurenexus/jobs/postgres`. Backend use cases may bind a jobs repository to their private business transaction and use the service to create an atomic outbox job; the application migration stays in backend. Queue transport, producers, consumers, relays, handlers, and delivery policy remain in executable apps and the jobs package. This does not expose repositories, transaction types, or transaction callbacks to capability callers merely to bridge the package boundary.

`createIngestions(runtime, importSources)` exposes `submit(UploadImportSourceCommand)` and `process(ingestionId)`. Submission uploads through the import-source capability before starting a transaction, then atomically creates the ingestion, links the available unlinked source, and records its job. The API adapts HTTP and cancellation but never orchestrates these database mutations or publishes directly to RabbitMQ. A later abort or submission failure, including an ambiguous commit, must preserve durably available input.

`Ingestions.process(ingestionId)` resolves linked source metadata and reads through import sources, preserving source lifecycle and bucket checks. It fully streams input to discard without buffering or parsing and returns `{ importSourceId, bytesRead }` only after EOF. Lookup and read failures propagate to the consumer through the worker handler, including failures after partial reads. The shell makes no database writes or byte deletions, even for `temporary` input. Job execution stays `pending`; the worker logs completion and the existing consumer owns acknowledgement and broker retry behavior. Duplicate deliveries safely reread and log again.

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

The ingestion handler calls the high-level backend processing shell, not repositories or direct queries. The existing pure Nuclei translator and its tests move from `apps/api/src/import` into the private backend `features/ingestions` area with only the types they need; unused resolver scaffolding is removed. The production shell does not call the translator. Matching, observation/finding persistence, ingestion accounting, execution-state orchestration, and cleanup remain deferred backend work, not worker logic. Accepted or successfully read bytes, including empty or malformed contents, are not imported observations.
