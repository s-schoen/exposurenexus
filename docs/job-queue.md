# Job Queue

The `@exposurenexus/jobs` package provides the durable job model and service,
PostgreSQL repository, single-publisher relay, and RabbitMQ producer and
consumer.

## Database And Runtime Ownership

As established by [ADR-0004](adr/0004-shared-backend-capabilities.md),
`@exposurenexus/backend/database` owns application migrations and the aggregate
database type. Backend's narrow jobs dependency includes the event contract,
`JobService`, and transaction-bound PostgreSQL persistence for atomic outbox
creation; the application migration lives in backend. The API runs backend migrations during
startup; the worker only verifies that required migrations have been applied.

Executable apps own connection lifecycle and jobs infrastructure composition.
Queue producers, consumers, relays, handlers, and delivery policy remain in
apps and the jobs package. Backend capability callers do not gain repository
or transaction access through this integration. The API hosts the producer and
one outbox relay. The worker's complete production handler set activates consumption
and calls the backend read-only ingestion shell. Empty handler sets still support
connected-idle operation. The package examples below describe queue primitives,
not an alternative production import path.

## API Lifecycle And Deployment

RabbitMQ is mandatory. Configure `RABBITMQ_URL` with an `amqp://` or `amqps://`
connection URL and `RABBITMQ_EXCHANGE` with the provisioned jobs exchange name.
The API does not provision topology and has no jobs-enable flag. After migrations
and default-admin initialization, startup connects the confirm-channel producer,
checks the exchange, starts the relay over the application database, and binds
HTTP before reporting completion. Initial dependency or bind failure exits
nonzero after cleanup. `STARTUP_TIMEOUT_MS` defaults to `30000`.

Run **exactly one active API instance**. Upgrades must stop the old API before
starting its replacement, without even temporary replica overlap. There is no
relay role, worker-hosted relay, singleton lock, or leader election. Workers may
scale independently. See [ADR-0005](adr/0005-worker-runtime-and-deployment-topology.md).

`SIGINT` and `SIGTERM` stop new HTTP and relay work and drain both before closing
the producer, API-owned object storage, and database. Upload work is tracked
independently of socket lifetime, cancelled and awaited before storage or database
closure. Repeated shutdown requests are safe.
`SHUTDOWN_TIMEOUT_MS` defaults to `60000`; expiry logs and forces a nonzero exit
even if draining or resource closure is still pending. Allow the supervisor more
than this deadline before forced termination. Shutdown preserves at-least-once
publication: a confirmed message whose outcome was not persisted can be published
again after restart, with the same identity.

## Transactional Outbox

Application code creates jobs through `JobService`, using a repository bound to
the same Kysely transaction as the associated business mutation. The complete
CloudEvent and its publication state are committed in PostgreSQL atomically
with that mutation. Application callers do not publish directly to RabbitMQ.

The polling relay is a separate boundary. It reads the oldest eligible pending
row, publishes its stored event through the confirm-channel producer, records
the observed result, and immediately looks for more work. It handles only one
job at a time and supports only one relay instance; it has no row claims,
leases, advisory locks, leader election, batching, or concurrent publication.

Publication is at least once. A positive RabbitMQ confirmation can be followed
by a PostgreSQL update failure. The live relay retries only that state update,
but a process exit inside this window leaves the row pending, so a restarted
relay publishes it again. The CloudEvent `id` and AMQP `messageId` remain stable
across attempts. Consumers must therefore make business effects idempotent.

Automatic publication retry is fixed-delay and finite: the defaults are five
attempts and five seconds between attempts. An exhausted job remains in
publication state `failed` until an operator explicitly retries it (resetting
the attempt count), abandons it, or performs a permitted deletion. Database
infrastructure recovery uses the same fixed delay but does not consume a
publication attempt. Publishing while disconnected does consume an attempt;
broker reconnection does not revive exhausted publication failures. Explicit
retry is available through the existing job service, but there is no operator
UI or dead-letter reconciliation yet.

Publication state (`pending`, `published`, `failed`, or `abandoned`) describes
delivery to RabbitMQ. Execution state (`pending`, `running`, `succeeded`, or
`failed`) independently describes the worker's logical processing result. A
publication failure is not an execution failure, and RabbitMQ redelivery is
not a new publication attempt. The current ingestion shell deliberately does not
write execution state: it remains `pending` even after a successful read or failure.
Use correlated worker logs for execution observability, not these unused transitions.

Deployments must supervise the API-owned producer and relay, guarantee the
single-relay restriction, and separately operate the RabbitMQ topology described
below. Ingestion submission uses this outbox and the worker fully reads stored
input; parsing/persistence and dead-letter-queue reconciliation remain unimplemented.

## Ingestion Handoff

Ingestion events have strict data containing only an ingestion UUID v4:

```json
{ "ingestionId": "550e8400-e29b-41d4-a716-446655440000" }
```

The ingestion ID is distinct from the CloudEvent/job ID. Backend metadata owns
the ingestion actor (`createdBy`), scanner source (`source`), and the associated
import-source reference. The shared import-source capability
resolves source metadata by ingestion ID and reads bytes by source ID without
exposing buckets or keys. Source metadata and its ingestion relationship survive
byte deletion; preexisting ingestions without raw input have no fabricated source.
See [Import Sources](import-sources.md#ingestion-references).

The former `userid`, `ingestdataurl`, and `format` fields are rejected, as are all
other extra fields. No file bytes, URLs, or storage credentials belong in job data.
This is a direct breaking contract replacement with no legacy parser, dual dispatch,
backfill, or broker purge; no deployed ingestion work required compatibility at replacement.

`POST /api/findings/import` registers immutable metadata without bytes, an ingestion,
or a job. The creator's one-shot
`PUT /api/findings/import/:importSourceId/content` stores and verifies the raw input,
then atomically creates the ingestion, links the available unlinked source, and
inserts the outbox job in one backend transaction. The high-level
`createIngestions(runtime, importSources)` capability owns upload and submission;
it uses `JobService` with a transaction-bound jobs repository, not a producer.

HTTP `202` returns `{ importSourceId, ingestionId, jobId }` in the API `data`
envelope only after durable storage and transaction success. It does not promise
broker publication, execution, or imported observations; relay publication
failures retain the existing finite retry behavior. The production handler calls
`Ingestions.process(ingestionId)`, which resolves the linked source with lifecycle
and bucket checks and streams the complete input to discard without buffering or
parsing. It returns `{ importSourceId, bytesRead }` only after EOF. The worker then
logs `ingestion shell completed` with `jobId`, `ingestionId`, `importSourceId`, and
`bytesRead`, allowing the consumer to acknowledge. Missing/unavailable input and
read failures, including mid-stream errors, propagate to the existing broker retry
and dead-letter path without classification or an application retry layer.

The shell makes no worker-side database writes, claims, or deduplication; execution
stays `pending` on start, success, and failure while relay publication updates
continue independently. Duplicate deliveries safely reread and log again. Neither
success nor failure changes source metadata, links, retention, or bytes; even
`temporary` sources are not cleaned up. Accepted/read bytes are not imported
observations, and zero-byte/malformed contents are not parsed or translated.
The UI import page remains disabled.

Every claimed upload ID is permanently consumed, including after failure or
cancellation; unused registrations never expire. A later submission failure or
ambiguous commit never deletes durably available input and logs its safe source ID.
Recovery requires a new registration and upload. Unlike relay redelivery with a
stable job ID, recovery from an ambiguous HTTP response can create a separate
submission and job: there is no request deduplication or same-ID upload retry.
See the [upload contract](import-sources.md#upload-and-submit).

Both roles require valid [S3 configuration](deployment.md#api-and-worker-storage-configuration)
at startup without probing connectivity or the bucket, addressing the same bucket,
endpoint, and account. The worker retains storage until accepted reads drain, then
closes it; startup failure cleans it up too. Failed or hung drain preserves the
existing bounded nonzero exit and unacknowledged redelivery behavior. Retained
inputs and abandoned registrations accumulate until cleanup is implemented or
explicitly performed. See the [stack smoke check](deployment.md#ingestion-shell-smoke-check)
for log correlation and read-only SQL verification of pending execution.

## Confirm-channel Producer

The producer owns its AMQP connection and confirm channel. It passively checks
that the configured exchange already exists, so it must be provisioned before
the application starts.

```ts
import pino from "pino";

import { createJobEvent, JobType } from "@exposurenexus/jobs";
import { createJobProducer } from "@exposurenexus/jobs/producer";

const connectionOptions = process.env.AMQP_URL;
if (!connectionOptions) {
  throw new Error("AMQP_URL is required");
}

const producer = await createJobProducer({
  connectionOptions,
  exchangeName: "EXPOSURENEXUS_JOBS",
  logger: pino(),
});

const event = createJobEvent({
  type: JobType.INGESTION,
  data: {
    ingestionId: "550e8400-e29b-41d4-a716-446655440000",
  },
});

try {
  await producer.publish(event);
  console.log(`Published ${event.type} as ${event.id}`);
} finally {
  await producer.close();
}
```

`publish` is the low-level operation used by the outbox relay. It validates and
serializes the complete supplied CloudEvent without
changing its identity, uses the event type as the routing key, and resolves only
after a positive publisher confirmation. Repeating publication of an event
therefore reuses its event ID as the AMQP message ID. Messages are persistent
and use mandatory routing. An unroutable return, negative confirmation,
connection loss, or other publish failure rejects the call; the producer does
not buffer jobs while disconnected. After an established connection is
interrupted, the producer reconnects with bounded exponential backoff and
passively checks the exchange again. Calls made while recovery is in progress
fail instead of being held in process memory.

## Consumer

The consumer owns its connection and channel. `createJobConsumer()` connects and
passively checks the existing queue without subscribing, acknowledging, or
rejecting deliveries. Initial connection, channel creation, or queue-check
failure rejects initialization and cleans up acquired resources; interruption
during initialization is also a failure, not a background retry.

After successful initialization, connection maintenance is independent of
consumption. Connection or channel loss triggers event-driven recovery and a
fresh passive queue check, even if `start()` has never been called. Idle
recovery never subscribes or touches queued jobs. Retry delays start at 100 ms,
double up to 30 seconds, and reset after successful recovery. There is no finite
recovery-attempt limit and no application polling loop.

Consumption requires explicitly registering a handler for every declared job
type before calling `start()`. Registration is typed to the full event for the
selected job type; unknown types, duplicates, and registration after start or
stop are rejected. An initialized consumer may stay idle without any handlers.
Starting during idle recovery activates consumption once recovery succeeds.
Consuming instances use manual acknowledgements and prefetch `1`, processing
one delivery at a time per worker replica. Handlers must be idempotent because
a delivery can run more than once.

```ts
import pino from "pino";

import { JobType } from "@exposurenexus/jobs";
import { createJobConsumer } from "@exposurenexus/jobs/consumer";

const connectionOptions = process.env.AMQP_URL;
if (!connectionOptions) {
  throw new Error("AMQP_URL is required");
}

const consumer = await createJobConsumer({
  connectionOptions,
  logger: pino(),
  queueName: "EXPOSURENEXUS_JOBS_INGEST",
});

consumer.registerJobHandler(JobType.INGESTION, async (event) => {
  // Transport demonstration only; production calls Ingestions.process instead.
  console.log(`Job ${event.id} identifies ingestion ${event.data.ingestionId}`);
});

const running = consumer.start();
process.once("SIGINT", () => void consumer.stop());
process.once("SIGTERM", () => void consumer.stop());

// Resolves when stop() has cancelled the subscription and closed resources.
await running;
```

`start()` rejects if a handler is missing and otherwise represents the
consuming lifetime, not subscription readiness. Its promise remains pending
across recovery and resolves after `stop()` finishes. A failed missing-handler
validation leaves registration open; repeated starts and starting after stop
are rejected. Once started, recovery also restores the subscription.

Call `waitForInitialActivation()` after `start()` when startup must confirm a
subscription. This separate promise resolves only after the first subscription
has been accepted on the current connection/channel. It rejects on the first
activation failure (including queue recheck, prefetch, consume, connection loss,
or cancellation), or if stopped before activation. Calling it before a valid
`start()` rejects without starting consumption. Its outcome is sticky: later
recovery neither turns a failure into success nor invalidates a prior success.

Lifetime-only callers can ignore this outcome and retain the existing automatic
retry behavior, without unhandled rejections. Fail-fast executables must observe
it, call `stop()` on failure, and keep their startup timeout active while waiting.
An activation wait does not impose a broker-operation timeout or stop recovery
itself. The worker also interrupts its readiness wait on shutdown so a pending
subscription cannot prevent it from calling `stop()`. Subsequent connection loss
after successful activation continues to use normal recovery.

`stop()` is safe before consumption starts and safe to repeat, including during
recovery. It prevents further recovery and subscription setup, waits for pending
broker operations, cancels any acquired subscription, drains accepted deliveries,
and then closes the channel and connection. A subscription acquired by an
already-pending `consume` call is still cancelled and drained before closing.
The package does not impose a shutdown deadline on broker operations or handlers;
the executable app owns process-level shutdown policy.

Structured lifecycle logs identify connection/channel loss, retry reasons and
delays, failed recovery, successful idle recovery, and subscription activation.
They omit raw broker errors, including messages, stacks, and nested causes,
because these can contain credentials outside connection URLs. Initialization
errors are still returned to the caller; callers must not log them unsanitized.
Job-processing error context and acknowledgement/rejection policy are unchanged.

## Processing Semantics

The consumer has one failure path for JSON decoding, event-schema validation,
unknown job types, and handler failures:

- A handler that resolves is followed by `basic.ack`; the job is complete from
  RabbitMQ's perspective.
- A malformed event, unknown type, or rejected handler is logged and returned
  with `basic.reject` and `requeue=true`.
- RabbitMQ applies delayed retry and the delivery limit. The package does not
  schedule retry timers, count deliveries, dead-letter messages, or deduplicate
  executions.
- If the connection or channel is lost before acknowledgement, RabbitMQ
  requeues the unacknowledged delivery. The handler must tolerate redelivery.
- The package does not send an application heartbeat or acknowledge a
  long-running handler early. The queue's consumer timeout must exceed the
  longest expected handler duration.

Multiple worker replicas may process jobs concurrently, but each replica
processes only one delivery at a time. The queue therefore provides at-least-
once delivery, not exactly-once execution.

## RabbitMQ Topology

### Reference Initialization

The consolidated `deployment/docker/docker-compose.yaml` runs `rabbitmq:4.3.5-management`
with persistent storage and AMQP port `5672` published on `127.0.0.1` only;
management remains internal. Its `rabbitmq-init` service
runs the checked-in Bash script using the standard `alpine:3` image; no
application image or additional application role is required.

Supply these six environment variables through your deployment's secret
configuration or the ignored root `.env` (alternatively a private Compose `--env-file`):

- `RABBITMQ_PROVISIONER_USER` and `RABBITMQ_PROVISIONER_PASSWORD`
- `RABBITMQ_API_USER` and `RABBITMQ_API_PASSWORD`
- `RABBITMQ_WORKER_USER` and `RABBITMQ_WORKER_PASSWORD`

Compose additionally requires `RABBITMQ_API_URL` and `RABBITMQ_WORKER_URL`:
full URLs with the respective provisioned credentials, host `rabbitmq`, and vhost
`exposurenexus`. Percent-encode username/password URL components, not the raw
credential inputs above. See the [eight-variable example](deployment.md#compose-configuration).
Local API and worker `.env` URLs use `localhost` and the same distinct accounts.

There are no broker credential defaults. Choose three distinct, non-`guest`
usernames using letters, digits, `_`, `-`, `.`, or `@` (start with a letter,
digit, `_`, or `-`), and independent strong passwords without control characters.
With Compose env files, single-quote passwords containing `$` to prevent
interpolation. Do not commit the env file or print rendered configuration with
real secrets; use `docker compose --env-file .env -f deployment/docker/docker-compose.yaml config --quiet`
from the repository root for validation.

Initialize independently of the application from the repository root:

```bash
docker compose --env-file .env -f deployment/docker/docker-compose.yaml up -d --wait rabbitmq
docker compose --env-file .env -f deployment/docker/docker-compose.yaml run --rm rabbitmq-init
```

Use a different private `--env-file` path if needed. The complete Compose file
requires the [storage variables](deployment.md#compose-configuration) even when
selecting only broker services.
The init command exits zero only after provisioning and verification succeed.
Run it again to reconcile application passwords, permissions, and the retry
policy. Initialization is bounded and failures exit nonzero with sanitized
diagnostics. Broker health alone does not establish topology readiness.

On **empty broker storage only**, RabbitMQ bootstraps the provisioner as its
default administrator, with the jobs vhost. On an existing volume, changing
`RABBITMQ_PROVISIONER_USER` or `RABBITMQ_PROVISIONER_PASSWORD` does **not** rotate
the stored account. Authenticate with the existing administrator and use normal
RabbitMQ administration to change it, then update deployment secrets. Never
remove the volume to repair a credential mismatch. Application accounts are
created or updated by init, not broker bootstrap. Reconnect application clients
after password or permission changes; this is not credential-revocation tooling.

The provisioner requires administrator privileges. Application accounts have no
management tags and permissions only in `exposurenexus`: the API may write to
`EXPOSURENEXUS_JOBS` using `exposurenexus.jobs.*` routing keys, and the worker may
read `EXPOSURENEXUS_JOBS_INGEST`. Neither can configure resources. RabbitMQ 4.3.5
allows these permissions for passive checks. Init removes other-vhost permissions
and stale topic permissions from these dedicated application accounts; do not
reuse unrelated broker users.

Init accepts matching declarations, rejects incompatible types, durability,
flags, or arguments without deleting topology, and verifies the effective source
queue policy, including operator-policy effects. Partial initialization is not
transactional; correct the reported conflict and rerun. Existing queues and
messages are preserved. Additional unrelated topology is not removed.

External deployments can run `bash scripts/rabbitmq-init.sh` (requires Bash, curl,
jq, and CA certificates for HTTPS) with the same
credentials and `RABBITMQ_MANAGEMENT_URL` pointing at their management endpoint
(use HTTPS across untrusted networks). Bootstrap the administrator separately.
The script supports 4.3.5 and later 4.3 patches, and requires enabled
`quorum_queue`, `stream_queue`, and `rabbitmq_4.3.0` feature flags. Disabled flags
fail clearly; operators must review and enable them rather than having init
silently change cluster-wide capabilities. Alternatively provision the equivalent
topology and policy below, plus the account restrictions above, with your own
infrastructure tooling. Application connections always remain passive.

Compose uses the official `alpine:3` image and installs these dependencies at
init-container startup, requiring access to Alpine package repositories. Init runs
as root with a writable container filesystem for package installation; the script
is mounted read-only, all capabilities are dropped, and no-new-privileges remains
enabled. The API and worker retain their nonroot, read-only distroless runtime.
The [reference stack](deployment.md) gates both roles
on healthy infrastructure and successful init, and worker on API health. Worker
still performs authoritative read-only migration checks, with no ongoing API
dependency. The same stack exposes PostgreSQL `5432` and AMQP `5672` on localhost
for [terminal-based development](development.md#start-infrastructure), without an override.

The complete real ingestion handler set activates consumption automatically, with
no operator flag. The worker has a subscription but no health endpoint; startup
mode, structured completion logs, and exit status are the operational signals.
Startup does not prove storage read permission or successful processing. Parsing,
observation/finding persistence, execution-state orchestration, and business
idempotency for future writes remain deferred.

### Equivalent Manual Topology

```bash
export RABBITMQ_VHOST=exposurenexus
export JOBS_EXCHANGE=EXPOSURENEXUS_JOBS
export JOBS_QUEUE=EXPOSURENEXUS_JOBS_INGEST
export JOBS_DLX=EXPOSURENEXUS_JOBS_DLX
export JOBS_DLQ=EXPOSURENEXUS_JOBS_INGEST_DLQ

# Create the vhost once if it does not already exist.
rabbitmqctl add_vhost "$RABBITMQ_VHOST"

rabbitmqctl list_feature_flags
# Run this only when stream_queue is listed as disabled.
rabbitmqctl enable_feature_flag stream_queue

rabbitmqadmin --vhost "$RABBITMQ_VHOST" exchanges declare \
  --name "$JOBS_EXCHANGE" --type topic --durable true
rabbitmqadmin --vhost "$RABBITMQ_VHOST" exchanges declare \
  --name "$JOBS_DLX" --type topic --durable true

rabbitmqadmin --vhost "$RABBITMQ_VHOST" queues declare \
  --name "$JOBS_QUEUE" --type quorum --durable true
rabbitmqadmin --vhost "$RABBITMQ_VHOST" queues declare \
  --name "$JOBS_DLQ" --type quorum --durable true

rabbitmqadmin --vhost "$RABBITMQ_VHOST" bindings declare \
  --source "$JOBS_EXCHANGE" --destination-type queue \
  --destination "$JOBS_QUEUE" --routing-key "exposurenexus.jobs.*"
rabbitmqadmin --vhost "$RABBITMQ_VHOST" bindings declare \
  --source "$JOBS_DLX" --destination-type queue \
  --destination "$JOBS_DLQ" --routing-key "exposurenexus.jobs.dead"
```

The topic binding matches the current `exposurenexus.jobs.ingest` routing key.
The dead-letter binding uses an explicit routing key so dead-lettered jobs have
a stable destination. The source queue policy below sets that key when it
forwards a job to the DLX.

## Retry And Dead-Letter Policy

Apply this policy to the quorum jobs queue:

```bash
rabbitmqctl set_policy -p "$RABBITMQ_VHOST" exposurenexus-jobs-retry \
  '^EXPOSURENEXUS_JOBS_INGEST$' \
  '{"delivery-limit":5,"delayed-retry-type":"failed","delayed-retry-min":5000,"delayed-retry-max":300000,"consumer-timeout":21600000,"overflow":"reject-publish","dead-letter-strategy":"at-least-once","dead-letter-exchange":"EXPOSURENEXUS_JOBS_DLX","dead-letter-routing-key":"exposurenexus.jobs.dead"}' \
  --priority 100 --apply-to quorum_queues
```

The effective policy must contain all of these values:

| Setting                   |                     Value | Meaning                                                                          |
| ------------------------- | ------------------------: | -------------------------------------------------------------------------------- |
| `delivery-limit`          |                       `5` | Dead-letter a job after the configured failed-delivery limit is exceeded.        |
| `delayed-retry-type`      |                  `failed` | Delay returns caused by failed deliveries such as this package's `basic.reject`. |
| `delayed-retry-min`       |                 `5000` ms | Start retry backoff at five seconds.                                             |
| `delayed-retry-max`       |               `300000` ms | Cap retry backoff at five minutes.                                               |
| `consumer-timeout`        |             `21600000` ms | Allow six hours for an unacknowledged handler.                                   |
| `overflow`                |          `reject-publish` | Reject new publishes when a configured queue length limit is reached.            |
| `dead-letter-strategy`    |           `at-least-once` | Retain source messages until the DLX publish is confirmed.                       |
| `dead-letter-exchange`    |  `EXPOSURENEXUS_JOBS_DLX` | Forward jobs that exceed the delivery limit.                                     |
| `dead-letter-routing-key` | `exposurenexus.jobs.dead` | Route dead-lettered jobs to the configured DLQ binding.                          |

RabbitMQ calculates delayed retry using linear backoff:
`min(delayed-retry-min * delivery-count, delayed-retry-max)`. This package
returns failed deliveries immediately; RabbitMQ owns the five-second-to-five-
minute delay and the delivery count. At-least-once dead-lettering requires the
`reject-publish` overflow strategy. If a queue length limit is needed, set it
as an infrastructure or operator policy based on capacity and retention
requirements.

The six-hour timeout is a safety boundary, not a handler deadline. RabbitMQ
evaluates acknowledgement timeouts periodically and returns unacknowledged
deliveries when a consumer times out. Set it above the longest legitimate
handler duration and monitor timeout events.
