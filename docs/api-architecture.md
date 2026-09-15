# API Architecture

The API is an executable adapter over shared backend capabilities, as established
by [ADR-0004](adr/0004-shared-backend-capabilities.md).

## Ownership

- `@exposurenexus/backend` owns business behavior, canonicalization, business
  validation, transactions, private persistence, database types, migrations, and
  reusable object-storage infrastructure.
- The API owns HTTP routes, cookies, authentication and permission middleware,
  event decorators, error translation, environment configuration, and startup.
- `@exposurenexus/contracts` owns client-safe serialized shapes, declarative
  Zod schemas, and primitive constraints. It does not own business invariants,
  backend commands, database records, password hashes, or session persistence.

Routes validate serialized request shape and require permissions before calling
capabilities. Backend capabilities enforce business meaning and invariants for
every caller. Commands requiring audit attribution receive an explicit user ID
such as `performedBy`, never Hono context or a generic execution context.

## Runtime And Capability Interfaces

Executable composition constructs one opaque runtime around its database and
logger, then selects capabilities through strict package subpaths:

```ts
import { createBackendRuntime } from "@exposurenexus/backend";
import { createAssets } from "@exposurenexus/backend/assets";
import { createAuthentication } from "@exposurenexus/backend/authentication";
import { createFindings } from "@exposurenexus/backend/findings";
import { createIdentity } from "@exposurenexus/backend/identity";
import { createStatistics } from "@exposurenexus/backend/statistics";
import { createVulnerabilities } from "@exposurenexus/backend/vulnerabilities";

const runtime = createBackendRuntime({ database, logger });
const identity = createIdentity(runtime);
const authentication = createAuthentication(runtime, {
  sessionLifetimeHours,
  sessionHmacSecret,
});
const assets = createAssets(runtime);
const findings = createFindings(runtime);
const vulnerabilities = createVulnerabilities(runtime);
const statistics = createStatistics(runtime);

const outcome = await assets.inventory.create({ asset, performedBy: userId });
```

The root exports runtime construction and application errors; it does not
import or initialize every capability. Each capability subpath owns its factory
and caller-facing commands, results, and operation-specific mutation outcomes.
The runtime keeps database access, logging, and per-runtime memoization private.
Constructing assets, findings, vulnerabilities, or statistics does not require
authentication configuration. These factories memoize their capabilities
independently within the runtime. The `/import-sources` capability uses
`createImportSources(runtime, storage, configuration = {})`, borrowing an explicit
`ObjectStorage` handle and snapshotting its bound bucket and import policy per
factory call. `ImportSourcesConfiguration` has only optional `maxSizeBytes` and
`retentionPolicy`; it has no SDK settings. There is no compatibility constructor
or `ImportSources.close()`. The capability needs no authentication configuration;
the API composes it for metadata registration, while worker composition remains
deferred. See [Import Sources](import-sources.md) for
separate real-storage construction and caller-owned shutdown.

Callers use these interfaces:

| Capability      | Interfaces                                                                       |
| --------------- | -------------------------------------------------------------------------------- |
| Identity        | `users`, `roles`, `authorization`                                                |
| Authentication  | Credential and session operations                                                |
| Assets          | `inventory`, `customFields`                                                      |
| Findings        | Finding, observation, and catalog-link operations                                |
| Vulnerabilities | Vulnerability catalog operations                                                 |
| Statistics      | Finding statistics                                                               |
| Import Sources  | Metadata registration; library streamed creation/read, lookup, and byte deletion |

Shared infrastructure uses the strict `@exposurenexus/backend/database` and
`@exposurenexus/backend/object-storage` subpaths. `createObjectStorage(config)`
constructs a bucket-bound handle without a database, backend runtime, environment
lookup, or startup I/O. The composing caller owns its client lifetime and may
share the handle across capabilities, closing it only after consumers and read
streams stop. Borrowing capabilities never close storage; `close()` does not drain
work. The API requires valid storage configuration at startup, with no connectivity
or bucket probe, and closes its handle after HTTP and relay drain and on startup
failure. General backend runtime construction and worker startup do not require S3
configuration. See [Object Storage](object-storage.md).

There are no wildcard exports or compatibility imports. Repository contracts,
dependency objects, lookup ports, persistence records, transaction types, and raw
S3 SDK clients and commands stay private. Routes, middleware, event decorators,
and handlers must not query Kysely or use repositories directly.
Database access outside backend is limited to executable composition, migration
invocation, jobs persistence composition, and test infrastructure.

## Backend Feature Organization

Backend feature implementation lives under `packages/backend/src/features/`.
Authentication, identity, assets, findings, vulnerabilities, statistics, and import sources are
top-level features. Identity groups users, roles, and authorization; assets groups
inventory and custom fields. Each feature colocates its behavior, private
persistence, table types, error catalogs, rules, and adjacent tests. Commands and
outcomes belong to the feature or subfeature that implements them.

Findings own observations and finding-vulnerability link mutations because their
transactions, projections, and audit updates are coupled. Asset projections and
audit handling stay at the assets level because both subfeatures use them. Shared
security-identifier canonicalization stays private at package level.

Reusable byte storage lives at `packages/backend/src/object-storage/`, outside
the import-source feature. It owns SDK access, object I/O, exact-byte counting,
backpressure, cancellation, and upload settlement. Import sources own provenance,
metadata, key generation, size/retention policy, finalization, and compensation
decisions; they translate typed storage failures rather than expose SDK or storage
error details. `RegisterImportSourceCommand`, `CreateImportSourceCommand`,
`ImportSource`, and persisted source metadata use one `sizeBytes` field: declared while incomplete and verified when
availability is established. Import sources enforce `maxSizeBytes` and pass the
declaration as `ObjectStorageWriteCommand.expectedSizeBytes`, relying on storage's
exact-write guarantee and failure `reason` without a second feature-owned byte
counter or observed-size bookkeeping. Storage error `actualSize` remains transient:
it is known only for fully observed input and is `null` for overruns or interrupted
input. Import sources do not persist it. The size constraint remains a nonnegative
safe integer. The forward `20260914-import-source-scanner` migration adds nullable
scanner `source` metadata, preserving historical input with unknown scanner as `null`.

Import sources reject recorded-bucket mismatches before byte reads or deletes with
`import_source.bucket_mismatch`, kind `conflict`, and only `{ sourceId: string }`
in details. A mismatch performs no object I/O or metadata mutation. Unavailable
reads still return `import_source.not_available`; already-deleted deletion remains
a no-op. Source/ingestion metadata lookup stays independent of the bound bucket.
Bucket equality does not validate endpoint/account continuity: operators must
supply the correct original endpoint, account, and bucket for historical objects.
There is no handle registry, historical routing, or relocation.

Separate entrypoints do not imply independent persistence: identity changes can
revoke authentication sessions in the same transaction, and findings can use
vulnerability persistence internally. These dependencies remain private; apps do
not orchestrate business transactions through repositories.

Database infrastructure aggregates feature-owned table types through type-only
imports and retains one chronological migration chain. Ingestion has only a table
definition under database schema until its behavior is implemented. Import sources
own the optional, unique ingestion reference and expose source metadata lookup by
ingestion ID without exposing queries or introducing a submission/processing use case. The root
`ApplicationError` similarly aggregates feature- and infrastructure-owned error
catalogs through type-only imports. No generic feature framework or separate
workspace packages are required.

## API Adaptation

The API container decorates mutation capabilities with API-local event adapters
and injects the relevant interfaces into routes. Findings and vulnerabilities
have separate decorators; observation events remain in the findings decorator.
Statistics goes directly to its route without an event decorator. Decorators consume backend
mutation outcomes, emit API events, and return route-facing values. They preserve
transaction-produced before-and-after facts without database rereads.

Routes pass `requestEventContext(c)` to these decorators for actor and request
correlation. Event context stays in the API; decorators pass only backend
commands to capabilities. See [API Event Bus](api-eventbus.md).

Authentication handles credentials and sessions; identity authorization resolves
current RBAC permissions. API middleware enforces access and owns request
annotation. See [API Authentication](api-authentication.md).

`POST /api/findings/import` validates strict JSON registration metadata and requires
authentication, CSRF protection, and `import:write`. It calls import sources'
`register` with the authenticated user as `performedBy`, leaving reservation and
policy in backend. The `201` response contains only `importSourceId` in the API
`data` envelope alongside `correlationId`. No bytes, ingestion, or job are created;
the ordinary API timeout applies. See [registration](import-sources.md#register-a-scan-upload).

## Application Errors

Backend throws typed `ApplicationError`s from the package root. The API maps
them according to [ADR-0001](adr/0001-service-application-errors.md):
`validation` → 400, `missing` → 404, `denied` → 403, `conflict` → 409,
and `unexpected` → 500. Non-unexpected errors expose their message;
unexpected errors expose only `internal server error`. Public reasons require
an explicit API allowlist; internal details are never serialized by default.
Intentional absence and authentication rejection retain their explicit result
contracts; adapters preserve existing nullable HTTP-facing behavior.

## Database Lifecycle

`@exposurenexus/backend/database` provides connection construction, the aggregate
database type, and `migrateToLatest(database, logger)`. Backend owns the migration
files, including the application migration integrating the jobs table.

Executable apps read environment variables and own database/pool lifecycle.
The API creates its PostgreSQL resources, runs backend migrations, bootstraps
the initial admin through identity, then starts serving. It closes the pool on
startup failure and during shutdown. The runtime does not manage resource
lifecycle.

The import HTTP endpoint registers metadata only; byte upload and ingestion
submission follow in ticket 02, and the UI import page remains disabled.
The worker remains connected but idle with no production ingestion handler. It
uses an undecorated backend runtime as a trusted system caller and checks required
migrations without applying them. Source storage and ingestion references do not
enable submission or processing. Future ingestion orchestration belongs in a high-level
backend ingestion use case, not in the worker or a recreated exposures aggregate.
Submission must atomically link the source and ingestion and insert the outbox job;
execution idempotency and cleanup policy remain deferred.
Queue infrastructure remains in apps and the jobs package;
see [Job Queue](job-queue.md).

## HTTP Update Semantics

API routes use `PUT` for full replacement of the addressed resource or
subresource. A `PUT` payload contains the complete client-editable state for
that target:

- omitted mutable fields are invalid;
- nullable mutable fields must be sent as either a value or `null`;
- server-owned and immutable fields are not accepted in the payload;
- collection subresources are replaced by the submitted collection, not patched
  or appended to.

Partial core metadata updates use `PATCH` with a separate schema and explicit
merge rules. The asset update payload must contain at least one editable field;
omitted fields remain unchanged and a no-op does not advance audit metadata.

## Tests

Backend tests own business behavior, persistence, transactions, and migrations.
API tests own HTTP adaptation, authorization middleware, cookies, event
decorators, error translation, and composition. Route doubles should implement
the full interface consumed by the route. Update commands, outcomes,
decorators, routes, and their tests together when changing a capability boundary.
