# Worker Runtime And Deployment Topology

ExposureNexus will add a long-lived `apps/worker` application for asynchronous jobs while continuing to publish one container image with API and worker roles. The API will host the existing transactional outbox relay, and the worker will initially remain connected but non-consuming until real ingestion behavior is implemented. This keeps deployment to two application roles without discarding queued work or prematurely defining ingestion and execution semantics.

The foundation described above shipped with no handlers. The current worker now consumes ingestion jobs through the read-only shell below; connected-idle operation remains a supported empty-handler-set behavior, not the production composition.

## Decision

This decision extends [ADR-0004](0004-shared-backend-capabilities.md), which establishes shared backend capabilities and executable-app ownership of infrastructure lifecycle. It preserves the publication and delivery contracts in the [job queue documentation](../job-queue.md).

### Application Roles And Image

One distroless, nonroot image contains the API, bundled UI, and worker. Its entrypoint runs Node directly, with `/app/apps/api/dist/src/index.js` as the default command. The worker overrides the command with `/app/apps/worker/dist/src/index.js`. No launcher or shell is needed, and only the selected application's configuration and startup modules are loaded.

There is no separate relay role. The API owns the producer and outbox relay alongside its existing HTTP and database lifecycle. RabbitMQ is required for both API and worker; there is no optional jobs-enable flag.

The relay supports only one active instance and has no claims, leases, or leader election. Consequently, deployments must run exactly one active API instance and use stop-before-start updates, including avoiding temporary overlap during upgrades. Worker replicas may scale independently. Adding API replication later requires revisiting relay coordination or ownership rather than starting multiple embedded relays.

### Worker Foundation And Activation

The worker composes the existing jobs consumer instead of adding an application polling loop. It owns its environment configuration, logging, database and object-storage resources, backend runtime, and queue lifecycle. It uses backend capabilities without API event decorators or API authentication configuration, as established by ADR-0004.

The initial release had no implemented ingestion handler. It established a RabbitMQ connection, passively verified the queue existed, and stayed alive without subscribing. It neither acknowledged nor rejected queued messages and did not consume their retry budgets. Connection maintenance and reconnection work independently of subscription startup. Waiting is event-driven, not a busy loop.

Activation depends on the implemented handler set, not a temporary configuration switch:

- No implemented handlers means intentional, connected idle operation.
- A complete handler set enables consumption automatically.
- A partially implemented handler set is a startup error; consuming workers must support every declared job type.

The production ingestion handler now completes the declared handler set and enables consumption without an additional operator flag. It calls `Ingestions.process(ingestionId)` and logs `ingestion shell completed` with `jobId`, `ingestionId`, `importSourceId`, and `bytesRead` only after the full stored stream has been consumed. Each consuming instance processes one delivery at a time with prefetch `1`. Multiple instances consume the same queue concurrently. Existing manual acknowledgement, broker-managed retry, and at-least-once delivery semantics remain unchanged.

### Startup And Schema Ownership

Both applications validate their own required configuration and dependencies during startup. Invalid configuration, missing required broker resources, or an initial dependency connection failure causes a clear error and nonzero exit rather than indefinite initialization retries. The supervisor owns restarting failed processes. After successful initialization, broker connection loss uses the jobs package's reconnection behavior, including while the worker is idle.

Both roles require nonblank `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`, with optional HTTP(S) `S3_ENDPOINT` and boolean-string `S3_FORCE_PATH_STYLE` (default `false`). Worker storage uses the existing factory and the same bucket, endpoint, and account as the API. Storage configuration validation performs no connectivity or bucket probe; startup logs do not establish storage reachability or read permission.

The API continues to run backend-owned migrations. The worker initializes its database and backend runtime but only performs read-only connectivity and migration-status checks: every migration required by its build must have been applied. Missing migrations cause startup failure; the worker never applies them. The shared backend database boundary owns the migration-status check rather than exposing migration internals to handlers.

In the reference Compose deployment, both roles wait for successful broker provisioning, healthy storage, and the existing one-shot bucket initializer. The worker also waits for API health to confirm API startup and migration completion. These are infrastructure startup dependencies, not application storage probes or an ongoing API dependency: the worker accesses shared backend capabilities directly and does not require the API to remain available.

### Shutdown And Operational Visibility

On `SIGINT` or `SIGTERM`, applications stop accepting new work and drain active work before closing dependencies. The API keeps the producer and database available until relay shutdown completes. The worker retains storage and database access while accepted handlers drain, then closes storage and database resources. Startup failure also cleans up acquired resources; storage must not close while accepted reads remain active. If drain fails or hangs, resources remain available until bounded failure exit.

Both roles use a configurable shutdown deadline with a default of 60 seconds. Compose allows 75 seconds before forced termination. If the application deadline expires, the process logs the timeout and exits nonzero without acknowledging unfinished work. Forced exit does not roll back completed business effects, and an unacknowledged delivery can run again.

The worker has no HTTP server, liveness or readiness endpoints, healthcheck command, status file, or Compose healthcheck. Structured logs report startup mode, connection loss and recovery, shell completion, and shutdown. Process exit status and a supervisor restart policy provide failure handling. A running process is not proof of successful input reads; completion is log-only and database execution state deliberately remains `pending`.

### Broker Provisioning And Development

The consolidated `deployment/docker/docker-compose.yaml` is the reference deployment and includes RabbitMQ, a one-shot topology init container, API, worker, PostgreSQL, private S3 storage, and its bucket initializer. The initial broker version is RabbitMQ 4.3.5, which supports the documented quorum-queue delayed-retry policy. Broker configuration retains the existing exchanges, queues, bindings, delivery limit, retry delays, consumer timeout, and dead-letter policy from the job queue documentation.

The init container provisions topology and permissions before either application starts. Provisioning is repeatable, preserves existing data, and fails on incompatible resources rather than deleting or replacing queues. Application connections remain passive: they verify required resources but do not provision broker topology.

Use three separate broker accounts: privileged provisioner, API publisher, and worker consumer. Application permissions are restricted to the jobs vhost and resources required by their operations, including passive topology checks. Management privileges remain exclusive to provisioning. Credentials come from environment configuration, not committed working passwords.

The reference deployment exposes PostgreSQL, AMQP, and S3 on localhost for terminal-based development; broker management remains internal. No development override is needed. Unrelated cleanup of legacy deployment examples is outside this work.

## Considered Alternatives

- **A separate relay role.** Rejected to retain only API and worker application roles. Embedding the relay in the API accepts a singleton API and stop-before-start deployments instead of adding coordination now.
- **A relay in every worker.** Rejected because independent worker replication would violate the relay's singleton contract.
- **Separate application images.** Rejected in favor of one release artifact with application entrypoint-path overrides, while preserving default API startup and the distroless runtime.
- **Refuse startup until ingestion exists.** Rejected because the foundation should run and exercise its infrastructure lifecycle before business processing is implemented.
- **Successful or always-rejecting placeholder handlers.** Rejected because they would respectively discard work or exhaust delivery retries. Connected, non-consuming operation leaves queued work untouched.
- **Optional RabbitMQ for API-only deployments.** Rejected in favor of one required infrastructure contract for both roles.
- **Worker health endpoints and real-container tests in this slice.** Deferred to keep the foundation limited to lifecycle logging, process supervision, unit tests, and existing static/build verification.

## Consequences And Deferred Work

The worker now consumes ingestion jobs as a read-only shell. Accepted or successfully read bytes are not imported observations; zero-byte and malformed contents are not parsed. API-only deployments require broker provisioning and both roles now require storage configuration, even though the image still defaults to the API role. Retained input and abandoned registrations accumulate; the shell performs no cleanup even for `temporary` sources. The UI import page remains disabled.

Publication retry remains finite: by default, five attempts with a five-second retry delay. Publishing while disconnected consumes an attempt. A prolonged broker outage can leave jobs in publication state `failed`; reconnecting does not revive them. Explicit publication retry is available through the existing service, but operator-facing controls and dead-letter reconciliation remain deferred. Long-lived processes do not imply infinite retries for each job.

The shell makes no worker-side database writes, including execution-state updates on start, success, or failure. API relay publication-state updates are unaffected. Missing/unavailable input and read failures propagate to existing consumer rejection and broker retry/dead-letter handling without classification or application retries. Duplicate deliveries safely repeat reads and logs; source metadata, links, retention, and bytes stay unchanged. Parsing, matching, observation/finding persistence, execution claims, deduplication, status endpoints, and cleanup remain deferred. Recording terminal execution `failed` on every handler exception would still conflict with broker redelivery, and `running` is not an exclusive claim; these contracts must be resolved before adding business effects.

The historical foundation added neither production placeholder/test job types nor container smoke tests. The active shell reuses the real ingestion job type and existing test infrastructure. A reproducible [stack smoke check](../deployment.md#ingestion-shell-smoke-check) now covers authenticated registration/upload, storage, relay, broker, worker logs, and read-only SQL state verification without a new integration framework. Unavailable live verification must be recorded explicitly, not counted as passing.
