# Job Queue

The `@exposurenexus/jobs` package provides the durable job model and service,
PostgreSQL repository, single-publisher relay, and RabbitMQ producer and
consumer.

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
publication attempt.

Publication state (`pending`, `published`, `failed`, or `abandoned`) describes
delivery to RabbitMQ. Execution state (`pending`, `running`, `succeeded`, or
`failed`) independently describes the worker's logical processing result. A
publication failure is not an execution failure, and RabbitMQ redelivery is
not a new publication attempt.

Runtime application wiring and dead-letter-queue reconciliation are outside
the package's current implementation. Deployments must compose and supervise
the producer and relay, guarantee the single-relay restriction, and separately
operate the RabbitMQ topology described below.

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
    userid: "550e8400-e29b-41d4-a716-446655440000",
    ingestdataurl: "https://example.com/ingest.json",
    format: "json",
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

The consumer also owns its connection. It passively checks the existing queue,
uses manual acknowledgements and prefetch `1`, and processes one delivery at a
time per worker replica.

Every worker replica must register every declared job type before calling
`start()`. Registration is typed to the full event for the selected job type.
Handlers must be idempotent because a delivery can run more than once.

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
  // Perform idempotent ingestion work using event.data here.
  console.log(`Processing ${event.id} from ${event.data.ingestdataurl}`);
});

const running = consumer.start();
process.once("SIGINT", () => void consumer.stop());
process.once("SIGTERM", () => void consumer.stop());

// Resolves when stop() has cancelled the subscription and closed resources.
await running;
```

`start()` rejects if a handler is missing and otherwise represents the
consumer lifetime. `stop()` cancels the subscription, waits for the active
handler, and then closes the channel and connection. The consumer reconnects
and resubscribes after an established connection or channel is interrupted;
recovery uses bounded exponential backoff.

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
