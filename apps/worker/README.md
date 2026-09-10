# Worker

Standalone backend/jobs adapter. It does not import the API, apply migrations,
serve HTTP, or implement ingestion. With no production handlers it checks the
database schema and broker queue, then remains connected without subscribing.
The jobs consumer owns connection recovery in both idle and consuming modes.

## Configuration

| Setting               | Required            | Default                     |
| --------------------- | ------------------- | --------------------------- |
| `DATABASE_URL`        | Yes, PostgreSQL URL |                             |
| `RABBITMQ_URL`        | Yes, AMQP/AMQPS URL |                             |
| `RABBITMQ_QUEUE`      | No                  | `EXPOSURENEXUS_JOBS_INGEST` |
| `LOG_LEVEL`           | No                  | `info`                      |
| `STARTUP_TIMEOUT_MS`  | No                  | `30000`                     |
| `SHUTDOWN_TIMEOUT_MS` | No                  | `60000`                     |

API authentication, session, origin, port and static-UI settings are ignored.
Topology must already exist and every migration required by this build must
already be applied. Failure logs identify the startup stage, not raw dependency
errors or connection URLs. Configuration validation reports only invalid field
names; arbitrary bootstrap errors remain sanitized. Jobs owns safe connection
loss/recovery logging.

## Lifecycle

Signal listeners are installed before acquisition. Startup checks connectivity
and migrations, constructs the opaque backend runtime, validates the handler
set, then acquires the checked consumer. An empty set is intentional idle mode;
a complete set requests consumption automatically; any other set fails startup.
There are no production placeholder handlers or consumption-enable flags.

`ready` means dependency checks completed and, for consuming mode, the initial
broker subscription was confirmed. Jobs `start()` remains a lifetime promise;
its unexpected resolution or rejection triggers shutdown. The worker instead
awaits the separate `waitForInitialActivation()` outcome under its startup timer.
An initial activation failure fails startup rather than waiting for recovery;
subsequent connection loss after activation retains normal jobs recovery.

`SIGINT`/`SIGTERM` start one shutdown and one hard deadline immediately, including
during startup. An in-flight acquisition must settle before cleanup so a late
consumer is stopped rather than leaked or activated. A signal interrupts the
activation wait so shutdown can stop an already-acquired consumer even if its
subscription setup is hung. Consumer stop cancels new
deliveries and drains accepted work before the database is destroyed (which also
closes its pool). A failed consumer stop cannot prove drain completion, so the
database remains available until the deadline. Startup itself is bounded: a
startup timeout initiates shutdown with its own deadline.

The deadline calls `process.exit(1)`, rather than merely setting `exitCode` or
awaiting cleanup. Unfinished work is not acknowledged by the worker. Tests inject
an exit spy; production must supply a terminating exit function. Normal cleanup
exits zero; startup, consumer-lifetime, cleanup failures and deadline expiry exit
nonzero. No ongoing API dependency is introduced.

## Commands

After workspace installation and dependency builds, use
`pnpm --filter @exposurenexus/worker build`, `test`, `typecheck:test`, or
`test:coverage`. `start` runs the compiled entry point; `dev` watches source,
loads a local ignored `.env`, and pretty-prints logs. Root `pnpm dev:worker`,
`pnpm test:worker`, and `pnpm coverage:worker` build dependencies first. Worker
builds, tests, and coverage participate in CI.

For local development, follow [infrastructure and environment setup](../../docs/development.md):
configure all eight root Compose variables, start only PostgreSQL/RabbitMQ, and
verify the one-shot init exits zero. Configure `apps/worker/.env` with the worker's
distinct provisioned consumer credentials and a full `RABBITMQ_URL` using
`localhost`, port `5672`, and vhost `exposurenexus`; percent-encode credentials in
URLs. Start `pnpm dev:api` first and wait for health and migration completion,
then run `pnpm dev:worker` in a separate terminal. Never run the container API
alongside a local API against the same database.

The [reference Compose stack](../../docs/deployment.md) starts `app` with `[api]`
and `worker` with `[worker]` from the same `APP_IMAGE` (default
`ghcr.io/s-schoen/exposurenexus:edge`). Both wait for healthy PostgreSQL/RabbitMQ and
successful init; worker additionally waits for API health. This does not replace
its read-only migration checks or introduce an ongoing API dependency.

Once the stack is healthy, scale with
`docker compose up -d --no-deps --scale worker=3 worker`. There are no worker host
ports, fixed container names, or per-worker relays. Worker has no HTTP endpoint,
healthcheck command, status file, or Compose healthcheck; logs and exit status
are its monitoring contract. An available idle process does not mean jobs are
being processed. Jobs accumulate until real handlers ship; real ingestion,
execution-state orchestration, and business idempotency remain future work.

Use Ctrl+C in the local terminal or `docker compose stop -t 75 worker` and wait for
exit. Compose uses `unless-stopped` restart and 75 seconds of stop grace around
the 60-second application deadline. Stop applications before infrastructure and
preserve volumes; never use `down -v`. Follow the deployment guide's explicit
stop-before-start API update procedure to prevent auto-restart and relay overlap.
Publication retries are finite (five attempts, five-second delay by default): a
broker outage can leave terminal publication failures requiring explicit retry
through the job service. Reconnection does not revive them; operator UI and
dead-letter reconciliation remain deferred.

Unit tests inject handlers only for the existing ingestion job type. Transport
integration tests run the real jobs consumer against a fake AMQP transport to
cover idle recovery, prefetch one, sequential dispatch, draining and forced exit.
Live PostgreSQL/RabbitMQ and container tests are outside this application slice.
