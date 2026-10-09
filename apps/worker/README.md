# Worker

Standalone async job worker over `@exposurenexus/backend` and `@exposurenexus/jobs`.
The production ingestion handler runs the ingestion pipeline in `src/ingestion/`:

1. `Ingestions.process(ingestionId)` loads the ingestion and buffers the entire linked
   import source in memory. An ingestion that is no longer `pending` is logged as
   `ingestion already processed` and acknowledged.
2. The classifier normalizes the source with the normalizer registered for the
   ingestion's scanner source. A source that cannot be parsed fails the ingestion with
   `ingestion.parse_failed`, and the delivery is acknowledged.
3. Asset matching resolves each candidate against one inventory read per ingestion.
4. Finding matching runs once per matched asset, over all of that asset's candidates in
   source order.
5. The worker builds an ingestion plan and `Ingestions.record` writes it in one
   transaction: new findings, observations attached to existing findings, reopened
   findings, and the completed ingestion.

Each unresolved candidate is logged at `warn` with its `sourceRecord`, the matching
stage, reason, and explanation, and is not imported. One `ingestion completed` line at
`info` counts candidates, new findings, attached observations, reopened findings, and
unresolved candidates by stage and reason. Raw evidence and source metadata are never
logged. The UI import page remains disabled.

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

The ingestion status is the domain record of processing. Job execution deliberately
remains `pending` on success and failure; API relay publication-state updates are
independent. Only a parse failure is deterministic. Every other failure rejects the
handler for the existing broker retry/dead-letter policy: storage and database errors,
including mid-stream read failures, matcher errors, and a plan gone stale because an
asset or finding changed after matching. A redelivery matches again on fresh data.
There are no execution claims, application retries, or status endpoints. Recording
locks the ingestion, so a duplicate delivery or a racing replica finds it no longer
`pending` and writes nothing. Importing the same file twice creates two ingestions with
duplicate observations. No source metadata, links, retention, or bytes change, and even
`temporary` input is never deleted. Retained input and abandoned registrations can
accumulate.

On startup failure, acquired resources are closed. On SIGINT/SIGTERM, the consumer
stops new work and drains accepted ingestions before storage and database closure.
Storage stays open if drain has not completed; the bounded shutdown deadline still
forces a nonzero exit, leaving unfinished deliveries unacknowledged for redelivery.
Because a plan is written in one transaction, a redelivery reprocesses cleanly.
Compose allows 75 seconds around the default 60-second application deadline.

## Matcher Evaluation

Use `pnpm eval:asset-matching` or `pnpm eval:finding-matching` from the repository
root for the standalone [matcher comparison harness](src/classification/evaluation/README.md).
It is separate from ingestion and the default test suite. The offline `identifier`
asset matcher and `identity` finding matcher are registered; both also run in the
ingestion pipeline.
