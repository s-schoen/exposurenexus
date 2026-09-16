# Worker

Standalone async job worker over `@exposurenexus/backend` and `@exposurenexus/jobs`.
The production ingestion handler calls `Ingestions.process(ingestionId)`, which
resolves the linked import source and streams the entire object to discard without
buffering or parsing it. Only after EOF does the worker log `ingestion shell completed`
with `jobId`, `ingestionId`, `importSourceId`, and `bytesRead`, then let the consumer
acknowledge the delivery. Accepted/read bytes are not imported observations; empty
or malformed scan contents are not parsed. The UI import page remains disabled.

## Configuration

Use [the development environment example](../../docs/development.md#configure-the-worker)
or [Compose](../../docs/deployment.md). Required variables are `DATABASE_URL`,
`RABBITMQ_URL`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`.
Storage must address the same bucket, endpoint, and account as the API. Optional
`S3_ENDPOINT` is an HTTP(S) URL; `S3_FORCE_PATH_STYLE` is a `true`/`false` string
(default `false`, overridden to `true` for the local gateway).

`RABBITMQ_QUEUE` defaults to `EXPOSURENEXUS_JOBS_INGEST`, `LOG_LEVEL` to `info`,
`STARTUP_TIMEOUT_MS` to `30000`, and `SHUTDOWN_TIMEOUT_MS` to `60000`. No API auth,
origin, static-serving, or upload-policy configuration is needed. Invalid storage
configuration fails startup, but there is no storage connectivity or bucket probe.

## Lifecycle And Limits

The worker checks database connectivity and required migrations without applying
them, passively checks the broker queue, and activates consumption when the full
real handler set is registered. No enablement flag is required. Each replica has
prefetch `1`; there is no worker HTTP endpoint or healthcheck.

The shell makes no database writes. Job execution deliberately remains `pending`
on success and failure; API relay publication-state updates are independent.
Lookup and read failures, including mid-stream failures, reject the handler for
the existing broker retry/dead-letter policy. There are no execution claims,
deduplication, application retries, or status endpoints. Duplicate deliveries
safely reread and log again. No source metadata, links, retention, or bytes change,
and even `temporary` input is never deleted by the shell. Retained input and
abandoned registrations can accumulate.

On startup failure, acquired resources are closed. On SIGINT/SIGTERM, the consumer
stops new work and drains accepted reads before storage and database closure.
Storage stays open if drain has not completed; the bounded shutdown deadline still
forces a nonzero exit, leaving unfinished deliveries unacknowledged for redelivery.
Compose allows 75 seconds around the default 60-second application deadline.

The pure Nuclei translator and its tests moved from `apps/api/src/import` into the
backend's private `features/ingestions` area; the live shell never calls it.
See [Import Sources](../../docs/import-sources.md#worker-processing-shell),
[Job Queue](../../docs/job-queue.md), and the reproducible
[stack smoke check](../../docs/deployment.md#ingestion-shell-smoke-check).
