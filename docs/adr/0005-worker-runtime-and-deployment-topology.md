# Worker Runtime And Deployment Topology

ExposureNexus will add a long-lived `apps/worker` application for asynchronous jobs while continuing to publish one container image with API and worker roles. The API will host the existing transactional outbox relay, and the worker will initially remain connected but non-consuming until real ingestion behavior is implemented. This keeps deployment to two application roles without discarding queued work or prematurely defining ingestion and execution semantics.

## Decision

This decision extends [ADR-0004](0004-shared-backend-capabilities.md), which establishes shared backend capabilities and executable-app ownership of infrastructure lifecycle. It preserves the publication and delivery contracts in the [job queue documentation](../job-queue.md).

### Application Roles And Image

One image contains the API, bundled UI, and worker. A Node-based launcher compatible with the existing distroless runtime accepts `api` or `worker` as its role argument. No argument starts the API and bundled UI; unknown arguments fail immediately. Role selection occurs before role-specific configuration or startup modules are loaded.

There is no separate relay role. The API owns the producer and outbox relay alongside its existing HTTP and database lifecycle. RabbitMQ is required for both API and worker; there is no optional jobs-enable flag.

The relay supports only one active instance and has no claims, leases, or leader election. Consequently, deployments must run exactly one active API instance and use stop-before-start updates, including avoiding temporary overlap during upgrades. Worker replicas may scale independently. Adding API replication later requires revisiting relay coordination or ownership rather than starting multiple embedded relays.

### Worker Foundation And Activation

The worker composes the existing jobs consumer instead of adding an application polling loop. It owns its environment configuration, logging, database resources, backend runtime, and queue lifecycle. It uses backend capabilities without API event decorators or API authentication configuration, as established by ADR-0004.

The initial release has no implemented ingestion handler. It establishes a RabbitMQ connection, passively verifies the queue exists, and stays alive without subscribing. It neither acknowledges nor rejects queued messages and does not consume their retry budgets. Connection maintenance and reconnection must work independently of subscription startup; this requires a narrow lifecycle change in the jobs package. Waiting is event-driven, not a busy loop.

Activation depends on the implemented handler set, not a temporary configuration switch:

- No implemented handlers means intentional, connected idle operation.
- A complete handler set enables consumption automatically.
- A partially implemented handler set is a startup error; consuming workers must support every declared job type.

A future release that implements ingestion therefore enables consumption without an additional operator flag. Each consuming instance processes one delivery at a time with prefetch `1`. Multiple instances consume the same queue concurrently. Existing manual acknowledgement, broker-managed retry, and at-least-once delivery semantics remain unchanged.

### Startup And Schema Ownership

Both applications validate their own required configuration and dependencies during startup. Invalid configuration, missing required broker resources, or an initial dependency connection failure causes a clear error and nonzero exit rather than indefinite initialization retries. The supervisor owns restarting failed processes. After successful initialization, broker connection loss uses the jobs package's reconnection behavior, including while the worker is idle.

The API continues to run backend-owned migrations. The worker initializes its database and backend runtime but only performs read-only connectivity and migration-status checks: every migration required by its build must have been applied. Missing migrations cause startup failure; the worker never applies them. The shared backend database boundary owns the migration-status check rather than exposing migration internals to handlers.

In the reference Compose deployment, both roles wait for successful broker provisioning. The worker also waits for API health to confirm API startup and migration completion. This is startup coordination, not an ongoing API dependency: the worker accesses shared backend capabilities directly and does not require the API to remain available.

### Shutdown And Operational Visibility

On `SIGINT` or `SIGTERM`, applications stop accepting new work and drain active work before closing its dependencies. The API keeps the producer and database available until relay shutdown completes; the worker keeps resources available while an active handler drains.

Both roles use a configurable shutdown deadline with a default of 60 seconds. Compose allows 75 seconds before forced termination. If the application deadline expires, the process logs the timeout and exits nonzero without acknowledging unfinished work. Forced exit does not roll back completed business effects, and an unacknowledged delivery can run again.

The worker has no HTTP server, liveness or readiness endpoints, healthcheck command, status file, or Compose healthcheck in this foundation. Structured logs report startup completion, intentional idle mode, connection loss and recovery, and shutdown. Process exit status and a supervisor restart policy provide failure handling. An alive idle process is not a claim that jobs are being processed.

### Broker Provisioning And Development

The root Compose stack is the reference deployment and includes RabbitMQ, a one-shot topology init container, API, worker, and PostgreSQL. The initial broker version is RabbitMQ 4.3.5, which supports the documented quorum-queue delayed-retry policy. Broker configuration retains the existing exchanges, queues, bindings, delivery limit, retry delays, consumer timeout, and dead-letter policy from the job queue documentation.

The init container provisions topology and permissions before either application starts. Provisioning is repeatable, preserves existing data, and fails on incompatible resources rather than deleting or replacing queues. Application connections remain passive: they verify required resources but do not provision broker topology.

Use three separate broker accounts: privileged provisioner, API publisher, and worker consumer. Application permissions are restricted to the jobs vhost and resources required by their operations, including passive topology checks. Management privileges remain exclusive to provisioning. Credentials come from environment configuration, not committed working passwords.

Broker ports remain internal in the reference deployment. A checked-in development override exposes AMQP and the management UI on localhost, allowing local application processes to reuse the root Compose infrastructure. Unrelated cleanup of legacy deployment examples is outside this foundation.

## Considered Alternatives

- **A separate relay role.** Rejected to retain only API and worker application roles. Embedding the relay in the API accepts a singleton API and stop-before-start deployments instead of adding coordination now.
- **A relay in every worker.** Rejected because independent worker replication would violate the relay's singleton contract.
- **Separate application images or direct internal script-path overrides.** Rejected in favor of one release artifact with a stable role argument, while preserving default API startup and the distroless runtime.
- **Refuse startup until ingestion exists.** Rejected because the foundation should run and exercise its infrastructure lifecycle before business processing is implemented.
- **Successful or always-rejecting placeholder handlers.** Rejected because they would respectively discard work or exhaust delivery retries. Connected, non-consuming operation leaves queued work untouched.
- **Optional RabbitMQ for API-only deployments.** Rejected in favor of one required infrastructure contract for both roles.
- **Worker health endpoints and real-container tests in this slice.** Deferred to keep the foundation limited to lifecycle logging, process supervision, unit tests, and existing static/build verification.

## Consequences And Deferred Work

The worker foundation is deployable but does not yet process ingestion jobs. Jobs may accumulate in RabbitMQ until a complete real handler set ships. Existing API-only deployments must add RabbitMQ configuration and provisioning even though the image still defaults to the API role.

Publication retry remains finite: by default, five attempts with a five-second retry delay. Publishing while disconnected consumes an attempt. A prolonged broker outage can leave jobs in publication state `failed`; reconnecting does not revive them. Explicit publication retry is available through the existing service, but operator-facing controls and dead-letter reconciliation remain deferred. Long-lived processes do not imply infinite retries for each job.

Real ingestion, a generic durable execution-state wrapper, execution retry classification, and business idempotency are deferred to the first real handler slice. In particular, recording terminal execution `failed` on every handler exception would conflict with broker redelivery, and execution `running` is not an exclusive claim. These contracts must be resolved before enabling real processing, including duplicate deliveries across replicas and crashes after business effects commit but before acknowledgement. A future ingestion handler will call the high-level backend ingestion use case described by ADR-0004 rather than implement business persistence in the worker.

This foundation adds neither production placeholder/test job types nor container smoke tests. Unit tests can inject handlers to exercise dispatch and draining without enabling production consumption. Build, lint, and formatting checks remain part of verification, but live broker policy and container integration coverage are explicitly deferred.
