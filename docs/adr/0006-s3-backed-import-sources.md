# S3-Backed Import Sources

**Status:** Accepted; storage, explicit deletion, durable references, metadata registration, one-shot byte upload, ingestion submission, and the read-only worker shell are implemented. API and worker both compose storage. Scanner parsing and persistence remain deferred, and UI import remains disabled.

Asynchronous ingestion needs input bytes that remain accessible independently of an HTTP request or worker host. Store raw input in private S3 object storage, track each import source in PostgreSQL, and identify an ingestion in its job rather than carrying bytes or an expiring URL. This separates file lifetime from message delivery without introducing the ingestion pipeline itself.

## Decision

### Ownership And Handoff

Add an import-source capability to the shared backend established by [ADR-0004](0004-shared-backend-capabilities.md). Callers use metadata registration, one-shot upload, streamed source creation, metadata lookup, streamed reading, and explicit deletion by source ID. The capability owns source persistence, policy, and lifecycle; an injected object-storage handle owns byte access. The worker calls the high-level ingestion capability in-process, which orchestrates import-source lookup and reading, not an HTTP endpoint or direct worker database queries.

An import source has its own identity, provenance, storage reference, and lifecycle metadata. It can exist before ingestion and belong to at most one ingestion. Future processing retries refer to the same ingestion and source; upload attempts cannot reuse a registration. Keeping raw input does not introduce reuse across ingestions or a reprocessing feature. Deleting bytes preserves source metadata and the ingestion relationship.

Optional declared MIME type is retained as nullable source metadata, including
through failed creation and byte deletion. Missing or blank declarations remain
unknown. This is caller-supplied provenance, not verified content, parser selection,
or an S3 `ContentType` header.

Ingestion job data contains only `ingestionId`. Authoritative actor, scanner source, and input metadata remain in the backend. The processing shell resolves the source from the ingestion. The old actor/URL/format job payload is replaced without a compatibility adapter; no deployed jobs required it. Submission creates production outbox jobs without purging queues; the worker's complete real handler set activates consumption automatically.

The delivered relationship is a nullable, unique ingestion reference on import-source
metadata with restricted ingestion deletion. Sources start unattached; existing
ingestions retain their original provenance without manufactured source records.
The import-source capability resolves metadata by ingestion ID, even after byte
deletion, while keeping storage references private. This is not a standalone
link operation or a placeholder ingestion-processing use case; the high-level
ingestion capability owns atomic submission.

### Scan Upload Registration

The API composes import sources and object storage for a two-request import flow.
`POST /api/findings/import` accepts strict JSON metadata
with a nonblank scanner `source`, a nonblank `originalFilename`, a nonnegative safe
integer `sizeBytes`, and optional string `mimeType`. Authentication, CSRF protection,
and current `import:write` permission remain required. The ordinary API timeout
applies. The response is `201` with `{ correlationId, data: { importSourceId } }`,
not an ingestion or job ID.

Backend `register(RegisterImportSourceCommand)` validates metadata and the configured
maximum before reserving an incomplete source, its creator, immutable input metadata,
retention snapshot, and private bucket/key reference. It performs no object I/O and
creates no ingestion or outbox row. The source's ingestion reference starts null.
The forward `20260914-import-source-scanner` migration adds nullable scanner `source`
metadata without changing historical provenance or inventing unknown scanner values.
The existing streamed `create` operation still records `source: null`; it is not
the completion step for registered uploads. The single `sizeBytes` field remains.

The returned source ID is a reference, not a bearer upload credential. Upload
accepts bytes only from the creator with current `import:write` permission, using
the reserved metadata, then submits an ingestion. Registration adds no edit,
deduplication, idempotency key, expiry, cleanup, listing, status, or download workflow.
Repeated calls create distinct sources, and unused registrations never expire.
The UI remains disabled, and registration does not enable scanner processing.

### One-Shot Upload And Submission

`PUT /api/findings/import/:importSourceId/content` accepts a raw body with
authentication, current permission, creator enforcement, and CSRF protection.
It cannot replace registered metadata. Optional `Content-Length` must match the
registered size before a claim or storage write; absent length, including chunked
transport, uses the known registered size for exact verification. Zero-byte input
is valid when registered as zero. No multipart parsing, whole-file buffering,
JSONL parsing, MIME-based scanner inference, or imported observations are added.

Durably and atomically claim one attempt before writing the private key, without
holding a database transaction open during transfer. Nullable `uploadStartedAt`
distinguishes an unused registration from an active or past attempt; the forward
`20260915-import-source-upload-attempt` migration marks historical attempted sources
as consumed. Authentication and pre-claim validation failures do not consume an
attempt. Concurrent losers and repeated uploads receive `409` and must neither
write nor compensate another request's bytes. A claim survives failure,
cancellation, crash, and cleanup forever; available, failed, or deleted sources
never become overwrite targets.

Backend `createIngestions(runtime, importSources)`
exposes `submit(UploadImportSourceCommand)`. The command carries only
`{ importSourceId, performedBy, body, contentLength?, signal }`, with an unread
Node `Readable` and required `AbortSignal`. Submission calls import sources'
`upload`, then creates the ingestion with its registered scanner and creator,
guards and links the available unlinked source, and inserts its outbox job in one
transaction. Use `JobService` with a transaction-bound jobs PostgreSQL repository
under ADR-0004's narrow allowance, not direct publication or public transaction
callbacks. A failed transfer creates no ingestion/link/job; a rolled-back
submission leaves none partially committed. The existing API relay owns delivery.

Return `202` with `{ correlationId, data: { importSourceId, ingestionId, jobId } }`
only after durable source availability and transaction success, with no third
request. This promises acceptance, not broker publication, processing, or imported
observations. Once availability succeeds, later abort, submission failure, or
ambiguous commit must never trigger byte deletion. Log the safe source ID for
diagnosis. Recovery requires a new registration and upload; no deduplication means
an ambiguous response can lead to a separate, duplicate submission. There is no
same-ID retry, expiry, automatic cleanup, or status endpoint.

The application gives binary uploads a separate deadline and aborts on timeout or
disconnection, awaits transfer settlement, and prevents unstarted submission.
It cannot retract an already committed transaction. Track upload work independently
of socket lifetime, cancelling and awaiting it during bounded shutdown before
storage or database closure. Storage writes accept an optional `AbortSignal`;
the composing application owns the deadline and lifecycle.

### Storage Interface

Use the reusable `@exposurenexus/backend/object-storage` module, which owns the official AWS S3 SDK and a configured, preprovisioned private bucket. The composing caller creates storage separately and injects it into import sources; neither module reads application environment variables or provisions resources. S3 dependencies remain outside the general backend runtime. No provider-specific adapters or blanket compatibility guarantee are introduced: an S3-compatible server still needs to support the SDK operations used.

Keys are generated internally, independently of original filenames. Write-once is an application convention: there is no replace operation, bucket-versioning requirement, or conditional-write enforcement. An administrator or other holder of write credentials can still alter an object; direct-to-storage browser uploads must revisit this assumption.

Creation takes a readable stream and declared byte length `sizeBytes`; registered upload uses the stored length. The feature validates the readable input and declared size against its configurable `maxSizeBytes` limit (100 MiB by default) before transfer. Storage enforces the exact declared byte count while streaming; the feature marks a source available only after that write succeeds and metadata finalization completes. Unknown declared sizes, whole-file buffering, and multipart/resumable uploads are outside this foundation; absent HTTP `Content-Length` is supported because registration supplies the size.

Reserve complete source metadata and the exact bucket/key reference before writing bytes. The feature safely owns input while reservation is pending, handles input errors during database waits, and destroys it on reservation failure. PostgreSQL and S3 do not share a transaction: caught failures receive best-effort compensation, while incomplete records identify interrupted work. Do not expose an incomplete or mismatched upload as available.

### Reusable Storage Refinement

The earlier object-storage tickets 01 and 02 refine the initial feature-local
storage decision: reusable
`@exposurenexus/backend/object-storage` provides bucket-bound streamed writes,
reads, deletion, and explicit `close()` without database or runtime dependencies.
`createImportSources(runtime, storage, configuration = {})` borrows this handle;
`ImportSourcesConfiguration` contains only optional `maxSizeBytes` and
`retentionPolicy`. There is no compatibility constructor or overload and no
`ImportSources.close()`.

The factory snapshots storage's bound bucket and its import policy. Multiple
capabilities may share one handle without adopting each other's metadata or
lifecycle. The composing caller closes storage only after all consumers,
operations, and returned read streams have stopped; closing is not a drain
operation. Import sources never close the borrowed handle.

Storage owns SDK access, exact-byte counting, backpressure, cancellation, and local
upload settlement, but never compensates by deleting failed writes. Import sources
own provenance, metadata, `import-sources/<random UUID>` keys independent of
filenames, size and retention policy, finalization, and compensation decisions.
`RegisterImportSourceCommand`, `CreateImportSourceCommand`, `ImportSource`, and
persisted source metadata use one `sizeBytes` field: the declared length for incomplete sources, verified when
availability is established. There is no separate expected/actual size pair or
feature-level observed-size bookkeeping. That size-model refinement revised the
original source migration in place, retaining nonnegative safe-integer size
constraints and availability invariants. Scanner metadata is added separately by
the forward registration migration described above.

The feature passes `sizeBytes` as storage's `expectedSizeBytes` and relies on the
exact-write guarantee rather than counting bytes again. Storage write errors keep
their transient `actualSize` detail: fully observed short input or complete input
before a storage failure has a known size, while interrupted or overrun input
reports `null`, never a partial count as the full size. The feature uses the failure
`reason` but does not persist this observed size; losing that durable failure
diagnostic is deliberate. It translates storage failures into the existing
`import_source.*` errors without leaking storage or SDK details.

Compensation waits for a failed transfer to settle. If a successful write is
followed by ambiguous database finalization, first confirm durable unavailability
before deleting bytes. If that cannot be confirmed, preserve the object and
report `cleanupRequired: true`; a rejected creation can still be durably available. This
is best-effort recovery, not cross-system atomicity. See
[Import Sources](../import-sources.md#failures-and-retention) for failure categories
and cleanup outcomes.

Source metadata and creation errors use one `cleanupRequired` boolean, not a
four-state cleanup enum. Reserved sources and unresolved or failed cleanup use
`true`; successful availability or confirmed cleanup uses `false`. This deliberately
drops the persisted pending-versus-failed distinction without changing compensation
ordering. The flag alone does not authorize deletion while an upload or source is
still in use.

Before reading or deleting bytes, compare the source's recorded bucket with the
factory's bound-bucket snapshot. A mismatch throws `import_source.bucket_mismatch`
with kind `conflict` and details containing only `{ sourceId: string }`, performs
no object I/O, and leaves availability and deletion bookkeeping unchanged. An
unavailable read still fails with `import_source.not_available`; an already-deleted
source remains a deletion no-op. Source-ID and ingestion-ID metadata lookups are
independent of the bound bucket, including incomplete, deleted, and differently
bucketed sources.

Bucket equality does not prove endpoint/account continuity. Operators must supply
the correct original endpoint, account, and bucket to access historical objects.
There is no handle registry, historical-bucket routing, fallback, or relocation.
Existing private references remain authoritative; storage injection requires no
reference migration or invented source records. See [Object Storage](../object-storage.md) for the storage
contract. Storage composition now belongs to the API lifecycle for registration and upload;
the worker separately owns its handle for the read-only processing shell.

### Worker Processing Shell

`Ingestions.process(ingestionId)` resolves the linked import source and calls its
streamed read operation, preserving lifecycle and recorded-bucket validation.
Missing or unavailable input rejects processing. Consume the complete stream to
discard without whole-file buffering or invoking the scanner translator, returning
`{ importSourceId, bytesRead }` only after EOF with `bytesRead === source.sizeBytes`.
A clean-EOF size mismatch rejects with `import_source.read_failed`. Lookup and storage
failures, including mid-stream errors and size mismatches, propagate to the existing
consumer's rejection and broker-managed retry/dead-letter path; no classification
or application retry layer is added.

The worker logs `ingestion shell completed` with `jobId`, `ingestionId`,
`importSourceId`, and `bytesRead`. It never logs raw scan content or credentials.
The shell writes no database state: execution remains `pending` on start, success,
and failure, independently of API relay publication updates. Duplicate deliveries
can safely reread and log again. No claims, deduplication, or status endpoint is added.
Neither success nor failure changes source metadata, links, retention, or bytes;
even `temporary` input is not deleted.

Scanner parsing is not implemented. The live shell does not translate stored input.
Accepted or successfully read bytes are not imported observations: zero-byte and
malformed contents are not parsed or validated as scanner output.

### Retention And Deletion

A deployment-wide policy selects `temporary` by default or `keep`. Snapshot the policy on each source so later configuration changes affect new sources only. There is no per-import override initially. `keep` means intended retention, not regulatory locking or protection against explicit deletion.

Deletion explicitly removes object bytes regardless of retention policy. It is repeatable, treats an already-absent object as success, and records deletion only after storage deletion succeeds. Preserve provenance and the first deletion timestamp, including overlapping deletes. If storage deletion succeeds but recording it fails, repeating the operation must complete the bookkeeping rather than require the object to exist again.

A future ingestion workflow must decide whether and when to invoke deletion using the source's recorded policy and durable processing outcome. The current shell implements neither execution-outcome policy nor automatic cleanup, including for `temporary` input. Merely exiting a handler is not proof that input is no longer needed for retry.

## Considered Alternatives

- **Bytes or presigned download URLs in jobs:** bytes burden broker storage and redelivery; expiring URLs couple input access to queue delay, retries, and credential lifetime. A durable ingestion reference avoids both.
- **Source metadata only on ingestion:** fewer records, but no independent identity or bookkeeping for input received before ingestion acceptance.
- **Bucket versioning or conditional writes:** stronger input stability, deliberately deferred in favor of internally generated keys and a write-once convention.
- **Age-based bucket expiration or scheduled cleanup:** cannot be adopted blindly alongside retained and active sources. The selected scope exposes deletion for the future handler rather than adding a scheduler.
- **Eager application wiring before a caller exists:** initially deferred. Registration/upload and the read-only worker shell now justify storage composition in both roles.

## Consequences And Deferred Work

Registration, submission, and the worker shell extend backend capabilities while
preserving the singleton API relay in [ADR-0005](0005-worker-runtime-and-deployment-topology.md).
Unlike the initial library-only foundation, both API and worker startup require nonblank
`S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`, with optional
HTTP(S) `S3_ENDPOINT` and boolean-string `S3_FORCE_PATH_STYLE` (default `false`).
Credentials remain static under the existing storage contract. Worker and API must
address the same bucket, endpoint, and account; matching bucket names alone do not
prove endpoint/account continuity. The following upload-policy settings are API-only.
`IMPORT_SOURCE_MAX_SIZE_BYTES` defaults to `104857600` and must be a nonnegative
safe integer; `IMPORT_SOURCE_RETENTION_POLICY` defaults to `temporary`, with `keep`
also supported. `IMPORT_SOURCE_UPLOAD_TIMEOUT_MS` is a positive bounded integer,
default `300000` (five minutes); registration and ordinary requests retain
`API_TIMEOUT_MS`, default `5000`. The HTTP server's `requestTimeout` is the upload
deadline plus the default `60000` ms header-receipt budget, allowing the application
timer to cancel first, while
`headersTimeout` retains its existing default. Both roles validate storage configuration
without a connectivity or bucket probe. The API owns storage and closes it after HTTP,
tracked upload work, and relay settlement, and on startup failure. Shutdown remains
bounded by `SHUTDOWN_TIMEOUT_MS`. The worker closes storage on startup failure and
after accepted work drains on shutdown, never while accepted reads remain active.
If drain fails or times out, bounded nonzero exit and unacknowledged redelivery
remain unchanged. General backend runtime construction still does not require S3
configuration. The existing Compose gateway and bucket initializer supply local
infrastructure separately and gate both API and worker startup; see
[Deployment](../deployment.md#api-and-worker-storage-configuration).

`temporary` is recorded intent, not automatic expiry. Retained inputs, abandoned registrations, and crash-abandoned or never-submitted sources accumulate until cleanup is implemented or explicitly performed. Caught upload failures receive best-effort compensation, not a guarantee of orphan reclamation; shell success or failure never triggers cleanup. Keeping provenance does not imply keeping bytes, and a self-hosted S3 gateway inherits the durability of its underlying storage rather than AWS S3's availability guarantees.

Binary HTTP upload, durable ingestion submission, and full streamed worker reads
are implemented. Scanner parsing, matching and observation/finding persistence,
ingestion accounting, execution-state orchestration, retry classification, source
reprocessing, automatic orphan reclamation, and operator cleanup tooling remain
separate work. Future execution must establish idempotency before adding business
effects; durable submission alone does not provide it. The
[stack smoke check](../deployment.md#ingestion-shell-smoke-check) verifies the live
handoff without introducing new infrastructure or changing job execution state.
