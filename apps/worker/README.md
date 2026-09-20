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

Scanner parsing is not implemented; the live shell reads stored input without
translating or matching it.
See [Import Sources](../../docs/import-sources.md#worker-processing-shell),
[Job Queue](../../docs/job-queue.md), and the reproducible
[stack smoke check](../../docs/deployment.md#ingestion-shell-smoke-check).

## Observation Candidate Normalization

`src/normalization/normalization.ts` provides a standalone scanner-to-candidate boundary. It
exports the plain TypeScript types `ObservationCandidate` and
`ObservationCandidateInput`, the `Normalizer` interface, and `normalize`. It is
not wired to the production ingestion handler and includes no real scanner
parsers; tiny test-only normalizers exercise the dispatcher in
`src/normalization/normalization.test.ts`.

Candidate objects come from trusted application code and are not revalidated at
runtime. Concrete normalizers remain responsible for parsing and validating the
external scanner bytes.

The interface uses the full `pino` `Logger`, not a narrowed logging adapter:

```ts
type ObservationCandidateInput = Omit<
  ObservationCandidate,
  "source" | "potentialAssetIdentifiers"
> & {
  potentialAssetIdentifiers: AssetIdentifierInput[];
};

interface Normalizer {
  normalize(bytes: Uint8Array, logger: Logger): ObservationCandidateInput[];
}

declare function normalize(
  source: string,
  bytes: Uint8Array,
  normalizers: ReadonlyMap<string, Normalizer>,
  logger: Logger,
): ObservationCandidate[];
```

Concrete normalizers may be classes using `implements Normalizer` or plain
objects with a `normalize` method. The registry holds these objects, and the
executor calls `normalizer.normalize(bytes, logger)` with the instance preserved.

A candidate is not a persisted observation or a successful asset/finding match:

| Field                                    | Contract                                                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `source`                                 | `string`, supplied by the executor rather than the parser.                                                 |
| `sourceRecord`                           | `string`, an opaque parser-defined per-file record locator, not cross-scan identity.                       |
| `title`                                  | Required `string`, supplied by the normalizer.                                                             |
| `description`, `remediation`, `evidence` | `string \| null`; the parser owns content and format, with no common Markdown rewriting.                   |
| `severity`                               | Existing `VulnerabilitySeverity`; parsers map missing or unknown severity to `info`.                       |
| `weakness`                               | Existing `Weakness` type; scanner-specific IDs use namespaces such as `nuclei`, `nessus`, and `semgrep`.   |
| `affectedResource`                       | Existing `ObservationAffectedResource`, using `unspecified` when no narrower detail is known.              |
| `observedAt`                             | `Date \| null`; the normalizer maps missing or invalid detection times to `null`, never the ambient clock. |
| `potentialAssetIdentifiers`              | Existing canonical `AssetIdentifier[]` values identifying the affected subject.                            |

All top-level candidate fields are required by the TypeScript type, including
nullable fields; `source` is omitted from the normalizer's candidate output, and
`AssetIdentifierInput[]` allows omitted namespaces before canonicalization.
Empty weakness data and empty asset identifier arrays are valid and silent.
Asset identifiers have no confidence scores or roles.
Unknown identifier namespace maps to `null`, deliberately making unknown and
global scope indistinguishable in candidates, without changing inventory identity
rules.

One source record may produce zero to many candidates sharing the same locator.
There is no cross-record deduplication. `normalize` selects a normalizer by an
explicit, case-sensitive map key; an unknown source throws an ordinary,
human-readable `Error`. There is no MIME or filename autodetection. Concrete
normalizers own their parsing loops and choose their log messages and levels.

The executor stamps `source` and uses the shared backend rules to canonicalize
weakness and asset identifiers. It logs and skips candidates whose identifiers
cannot be canonicalized, without revalidating the rest of the candidate object.
It preserves order and duplicates. Empty output is valid, including when all
candidates are skipped. Fatal parser errors propagate
unchanged as ordinary human-readable, log-safe `Error`s. There are no returned
warnings, diagnostic types or codes, or custom error classes.

Normalization takes whole-file bytes and returns a result batch, accepting the
memory cost of holding input and output. It reads no database, network, or clock;
logging is its only side effect. There is no generic context bag, base class,
registry framework, or factory. Matching, persistence, reprocessing, and execution
bookkeeping remain out of scope.

Reuse `assetIdentifierSchema` from `@exposurenexus/backend/assets` and
`weaknessSchema` from `@exposurenexus/backend/findings`; their underlying helpers
stay private under [ADR-0004](../../docs/adr/0004-shared-backend-capabilities.md#candidate-normalization-refinement).
The worker uses the existing `@exposurenexus/contracts` workspace dependency for
shared shapes and severity, not a new package or library.
