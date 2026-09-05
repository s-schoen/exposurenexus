# API Architecture

The API is an executable adapter over shared backend capabilities, as established
by [ADR-0004](adr/0004-shared-backend-capabilities.md).

## Ownership

- `@exposurenexus/backend` owns business behavior, canonicalization, business
  validation, transactions, private persistence, database types, and migrations.
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
import { createExposures } from "@exposurenexus/backend/exposures";
import { createIdentity } from "@exposurenexus/backend/identity";

const runtime = createBackendRuntime({ database, logger });
const identity = createIdentity(runtime);
const authentication = createAuthentication(runtime, {
  sessionLifetimeHours,
  sessionHmacSecret,
});
const assets = createAssets(runtime);
const exposures = createExposures(runtime);

const outcome = await assets.inventory.create({ asset, performedBy: userId });
```

The root exports runtime construction and application errors; it does not
import or initialize every capability. Each capability subpath owns its factory
and caller-facing commands, results, and operation-specific mutation outcomes.
The runtime keeps database access, logging, and per-runtime memoization private.
Constructing assets or exposures does not require authentication configuration.

Callers use the nested interfaces:

| Capability     | Interfaces                                  |
| -------------- | ------------------------------------------- |
| Identity       | `users`, `roles`, `authorization`           |
| Authentication | Credential and session operations           |
| Assets         | `inventory`, `customFields`                 |
| Exposures      | `findings`, `vulnerabilities`, `statistics` |

The only additional public subpath is `@exposurenexus/backend/database` for
composition infrastructure. There are no wildcard exports or compatibility
imports. Repository contracts, dependency objects, lookup ports, persistence
records, and transaction types stay private. Routes, middleware, event
decorators, and handlers must not query Kysely or use repositories directly.
Database access outside backend is limited to executable composition, migration
invocation, jobs persistence composition, and test infrastructure.

## API Adaptation

The API container decorates capabilities with API-local event adapters and
injects the relevant nested interfaces into routes. Decorators consume backend
mutation outcomes, emit API events, and return route-facing values. They preserve
transaction-produced before-and-after facts without database rereads.

Routes pass `requestEventContext(c)` to these decorators for actor and request
correlation. Event context stays in the API; decorators pass only backend
commands to capabilities. See [API Event Bus](api-eventbus.md).

Authentication handles credentials and sessions; identity authorization resolves
current RBAC permissions. API middleware enforces access and owns request
annotation. See [API Authentication](api-authentication.md).

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

There is no worker application or persisted ingestion implementation yet. A future
worker will use selected undecorated capabilities as a trusted system caller and
will not run migrations. Future ingestion orchestration belongs in a high-level
exposures use case. Queue infrastructure remains in apps and the jobs package;
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
the full nested interface consumed by the route. Update commands, outcomes,
decorators, routes, and their tests together when changing a capability boundary.
