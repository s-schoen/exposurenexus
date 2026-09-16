# Deployment

This guide shows setup for local evaluation with docker compose.

## Current Runtime Requirements

Both applications require PostgreSQL and initialized RabbitMQ. The consolidated
`deployment/docker/docker-compose.yaml` includes `postgres`, `rabbitmq`, one-shot
`rabbitmq-init`, `app` (API and UI), `worker`, `s3`, and one-shot `init-s3`.
Both roles wait for healthy PostgreSQL and RabbitMQ and successful broker init;
failed broker provisioning blocks startup. Worker additionally waits for `app`
health after API initialization and migrations. This is startup coordination, not an ongoing API
dependency or callback. Worker migration checks remain read-only and authoritative
outside Compose too; workers never apply migrations.

The API requires valid S3 configuration, but performs no storage connectivity or
bucket probe at startup. Compose's existing VersityGW healthcheck and `init-s3`
provisioning are separate infrastructure steps, not API probes or registration
startup gates. Worker storage configuration is unchanged and remains deferred to
ticket 03.

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

Create an ignored root `.env` (or use a private `--env-file` path in the commands
below) with the required broker and storage variables. These non-secret credential
placeholders must be replaced with independent strong values:

```env
RABBITMQ_PROVISIONER_USER=topology-admin
RABBITMQ_PROVISIONER_PASSWORD=replace-with-provisioner-password
RABBITMQ_API_USER=api-publisher
RABBITMQ_API_PASSWORD=replace-with-api-password
RABBITMQ_WORKER_USER=worker-consumer
RABBITMQ_WORKER_PASSWORD=replace-with-worker-password
RABBITMQ_API_URL=amqp://api-publisher:replace-with-api-password@rabbitmq:5672/exposurenexus
RABBITMQ_WORKER_URL=amqp://worker-consumer:replace-with-worker-password@rabbitmq:5672/exposurenexus
S3_BUCKET=exposurenexus
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=replace-with-local-s3-access-key
S3_SECRET_ACCESS_KEY=replace-with-local-s3-secret
```

The two `RABBITMQ_*_URL` values are **full URLs**, using the respective provisioned credentials,
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

The S3 values are shared by the API, existing VersityGW service, and `init-s3`.
The initializer creates `S3_BUCKET` if absent; it does not run inside the API.
Compose defaults the API's `S3_ENDPOINT` to `http://s3:7070` and
`S3_FORCE_PATH_STYLE` to `true` for this gateway. Local host processes use
`http://localhost:7070` instead. No storage variables are added to `worker`.

This local-evaluation stack shares gateway root credentials with the API and
initializer. Do not use that privilege model outside isolated evaluation: provision
a private bucket and restricted application credentials as described in
[storage requirements](import-sources.md#storage-requirements), and adapt the
Compose services and provisioning for that deployment. S3 data resides in the
existing volumes; do not delete them to repair credentials or configuration.

## API Storage Configuration

These variables configure the API, independently of backend library callers and
the opt-in `IMPORT_SOURCE_S3_TEST_*` smoke-test variables:

| Variable                          | Requirement / API Default                                           |
| --------------------------------- | ------------------------------------------------------------------- |
| `S3_BUCKET`                       | Required nonblank private bucket name                               |
| `S3_REGION`                       | Required nonblank signing region                                    |
| `S3_ACCESS_KEY_ID`                | Required nonblank static access key ID                              |
| `S3_SECRET_ACCESS_KEY`            | Required nonblank static secret access key                          |
| `S3_ENDPOINT`                     | Optional HTTP(S) URL; omit for the SDK's regional S3 endpoint       |
| `S3_FORCE_PATH_STYLE`             | `true` or `false` string; default `false`                           |
| `IMPORT_SOURCE_MAX_SIZE_BYTES`    | Nonnegative safe integer; default `104857600` (100 MiB)             |
| `IMPORT_SOURCE_RETENTION_POLICY`  | `temporary` or `keep`; default `temporary`                          |
| `IMPORT_SOURCE_UPLOAD_TIMEOUT_MS` | Positive bounded integer milliseconds; default `300000` (5 minutes) |

The reference Compose stack supplies the local endpoint/path-style overrides above
and forwards the size, retention, and upload-timeout settings with their API defaults. Credentials
are static under the existing storage contract; session tokens and asynchronous
credential providers are not supported. Keep credentials in private configuration,
never in requests, responses, jobs, or tracked files. Use HTTPS outside isolated
local infrastructure.

Missing or invalid configuration fails API startup. Validation does not contact
storage, verify bucket existence, or establish access permissions. Registration
performs no object I/O either, so API health and successful registration are not
storage-readiness checks. The API owns and closes its storage client after HTTP,
tracked upload work, and relay settlement, and on startup failure. General backend
runtime construction and the idle worker do not require S3 configuration.

The maximum applies to declared upload size before reservation and again at upload,
including an allowed zero-byte declaration. The retention policy is snapshotted
into each new source, with no per-registration override or retroactive changes. Neither policy
expires registrations or automatically deletes data.

## Upload Deadlines And Recovery

`IMPORT_SOURCE_UPLOAD_TIMEOUT_MS` applies only to the raw-body
`PUT /api/findings/import/:importSourceId/content`, with a five-minute default.
Set it in the API environment or root Compose `.env`, for example:

```env
IMPORT_SOURCE_UPLOAD_TIMEOUT_MS=300000
```

Registration (`POST /api/findings/import`) and ordinary requests retain
`API_TIMEOUT_MS`, default `5000`. Upload middleware aborts on deadline or
disconnection, awaits transfer settlement, and prevents submission that has not
begun instead of leaving an upload running after a timeout response. The HTTP
server sets `requestTimeout` to the upload deadline plus `60000` ms to allow for
Node's default header-receipt budget before the application timer starts;
`headersTimeout` retains its existing default. Configure any reverse proxy's body-size limit and upload/request
timeouts to accommodate the chosen size and deadline, with room for cancellation
settlement, rather than cutting off uploads at an ordinary API timeout.

Upload work is tracked independently of socket lifetime. Shutdown cancels and
awaits it before storage and database close, including work from disconnected
clients. The existing `SHUTDOWN_TIMEOUT_MS` still bounds the whole shutdown; a
five-minute upload deadline does not extend the default 60-second shutdown grace.
The supervisor grace must remain longer than the shutdown deadline.

Unused registrations never expire. A durably claimed upload ID is permanently
consumed, including after transfer failure, cancellation, crash, or cleanup; later
PUTs receive `409`. Failed or incomplete transfers remain unavailable and receive
best-effort compensation, with unresolved cleanup recorded. Once the source is
durably available, later abort, submission failure, or ambiguous commit never
triggers byte deletion. Submission failures log only the safe source ID for diagnosis,
not storage references, credentials, or raw external errors.

Recover with a new registration and upload, not by retrying the consumed ID or
resetting its marker. A lost response can hide a committed submission; there is no
request deduplication, so starting over may produce a separate, duplicate ingestion
and job. There is no status endpoint, automatic retry of the upload, expiry, or
automatic cleanup. Neither `temporary` retention nor a timeout guarantees orphan
reclamation. See [Import Sources](import-sources.md#failures-and-retention) for
diagnosis and explicit library cleanup safeguards; existing relay publication
retry behavior is unchanged.

## Start The Compose Stack

Both `app` and `worker` select their application entrypoint paths using the same
`${APP_IMAGE:-ghcr.io/s-schoen/exposurenexus:edge}` image. Optionally set `APP_IMAGE`
in root `.env` to a release tag or digest for both roles. Validate without printing
secrets, then start from the repository root:

```bash
docker compose --env-file .env -f deployment/docker/docker-compose.yaml config --quiet
docker compose --env-file .env -f deployment/docker/docker-compose.yaml up -d --wait
docker compose --env-file .env -f deployment/docker/docker-compose.yaml ps -a
docker compose --env-file .env -f deployment/docker/docker-compose.yaml logs rabbitmq-init init-s3 app worker
```

The image serves the React UI and Hono API from one container. API routes remain
under `/api`; all other browser navigation paths are served by the built UI.

Open `http://localhost:3001`.

`POST /api/findings/import` now [registers scan-upload metadata](import-sources.md#register-a-scan-upload)
and returns an import-source ID, not an ingestion or job ID. The creator then sends
raw bytes once to `PUT /api/findings/import/:importSourceId/content`, retaining
current `import:write` permission and CSRF protection. Its `202` response contains
`{ importSourceId, ingestionId, jobId }` in `data` only after durable storage and one
transaction creates the ingestion, source link, and outbox job. This is acceptance,
not successful publication, processing, or imported observations. Actual scan
processing remains unavailable until ticket 03 and the UI import page remains disabled.

Confirm both init services exited zero and `app` is healthy. Worker is a normal connected idle
service, not opt-in. It has no subscription, HTTP endpoint, healthcheck command,
status file, or Compose healthcheck. Monitor structured lifecycle logs and process
exit status; a running process does not imply processing readiness. Jobs accumulate
until a complete real handler set ships and enables consumption automatically,
without an operator flag. Processing, execution-state orchestration, and
business idempotency remain future work.

Both applications use `restart: unless-stopped` for unexpected exits and a
75-second stop grace period around the default 60-second application deadline.
Init remains one-shot with `restart: "no"`. Application security hardening retains
the nonroot image, read-only filesystem, dropped capabilities, and no-new-privileges.
PostgreSQL `5432`, RabbitMQ AMQP `5672`, and S3 `7070` are published on `127.0.0.1` only for
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
API configuration, including the required S3 variables, in private `api.env`.
Provision the private bucket separately; the API will not create or probe it.
The worker requires `DATABASE_URL` and
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
docker compose --env-file .env -f deployment/docker/docker-compose.yaml pull app worker
docker compose --env-file .env -f deployment/docker/docker-compose.yaml stop -t 75 worker app
docker compose --env-file .env -f deployment/docker/docker-compose.yaml up -d --no-deps --wait app
docker compose --env-file .env -f deployment/docker/docker-compose.yaml up -d --no-deps worker
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
docker compose --env-file .env -f deployment/docker/docker-compose.yaml up -d --no-deps --scale worker=3 worker
docker compose --env-file .env -f deployment/docker/docker-compose.yaml logs -f worker
```

Workers have no fixed container names, published ports, or relay per replica. Use
the same command with `worker=1` to scale down. Scaling idle workers does not enable
ingestion. `--no-deps` bypasses startup gates: use it only after verifying infrastructure,
provisioning, and API initialization.

For graceful shutdown, stop applications before their dependencies:

```bash
docker compose --env-file .env -f deployment/docker/docker-compose.yaml stop -t 75 worker app
docker compose --env-file .env -f deployment/docker/docker-compose.yaml stop postgres rabbitmq s3
```

SIGTERM (containers) or Ctrl+C/SIGINT (terminals) stops new work and drains active
work before connections close. The API also cancels and awaits tracked uploads,
including those whose sockets have disconnected, before closing storage or the
database. Wait for exit; deadline expiry is nonzero and
unfinished deliveries are not acknowledged. If increasing `SHUTDOWN_TIMEOUT_MS`,
increase supervisor grace beyond it too. These commands preserve PostgreSQL, RabbitMQ, and
S3 data. Do not use `down -v` or delete volumes for updates, shutdown, or
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
