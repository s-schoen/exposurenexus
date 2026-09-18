# Import Sources

The API accepts scans in two requests: register immutable metadata through
`POST /api/findings/import`, then send raw bytes once through
`PUT /api/findings/import/:importSourceId/content`. The second request stores the
input and durably submits an ingestion and outbox job without a third request.
Acceptance is not processing: the worker now reads the full stored input and logs
shell completion, but neither accepted nor successfully read bytes are imported
observations. Contents are not parsed, and the UI import page remains disabled.

The shared backend also provides streamed creation, reading, metadata lookup, and
explicit byte deletion while preserving provenance. These remain library operations,
independent of HTTP authentication. Both API and worker require valid storage
configuration at startup, addressing the same bucket, endpoint, and account.

The capability borrows an explicitly injected, bucket-bound
[Object Storage](object-storage.md) handle. Storage owns bytes, SDK access, exact
byte counting, cancellation, and transfer settlement; import sources own policy,
provenance, metadata, finalization, and compensation decisions. The composing
caller owns storage shutdown, not the capability.

## Register A Scan Upload

Send `Content-Type: application/json` to `POST /api/findings/import` with an
authenticated session, current `import:write` permission, and the existing
[CSRF protections](api-authentication.md#csrf-protection), including an allowed
Origin and matching `X-CSRF-Token` header:

```json
{
  "source": "example-scanner",
  "originalFilename": "scan.jsonl",
  "sizeBytes": 1024,
  "mimeType": "application/x-ndjson"
}
```

The JSON object is strict: extra fields are rejected. `source`, `originalFilename`,
and `sizeBytes` are required. `source` is a nonblank scanner identifier; the filename
must be nonblank, and the size must be a nonnegative safe integer, including zero. The
declared size must not exceed the API-configured maximum (100 MiB by default).
Invalid or oversized metadata is rejected before reserving a source or doing
storage work. `mimeType` is an optional string, not scanner detection or content
validation; omitted or blank MIME declarations are stored as `null`.

Success returns HTTP `201` in the existing API envelope:

```json
{
  "correlationId": "request-correlation-id",
  "data": { "importSourceId": "550e8400-e29b-41d4-a716-446655440000" }
}
```

The source starts `incomplete` with `ingestionId: null`, the authenticated user
profile as `createdBy`, `uploadStartedAt: null`, immutable input metadata, a
retention-policy snapshot, and an internally generated private bucket/key reference.
Registration performs no object I/O and creates no ingestion, outbox row, or job. It retains the ordinary
`API_TIMEOUT_MS` deadline, not a binary-upload deadline.

The returned ID is a reference, not a bearer upload credential. Byte upload is
restricted to this creator with current `import:write` permission, using the
already registered metadata. There is no edit endpoint, idempotency key,
registration deduplication, expiry, cleanup job, listing, status, or download
endpoint. Repeated valid registrations create distinct sources. Neither
`temporary` nor `keep` triggers automatic deletion, and callers cannot override
the configured retention policy per registration.

## Upload And Submit

Send the file itself as the raw body of
`PUT /api/findings/import/:importSourceId/content`, not multipart form data or a
JSON wrapper. The authenticated creator must still have current `import:write`
permission and satisfy the same CSRF protections as registration. Unknown sources
and unauthorized callers are rejected before claiming an attempt or accessing
object bytes.

The registered scanner source, filename, MIME type, size, creator, and retention
policy remain authoritative; upload headers or body cannot override them. Optional
`Content-Length` must equal the registered `sizeBytes`, or validation rejects the
request before a claim or storage write. Without that header, including chunked
transport, storage still knows the registered size and verifies exactly that many
bytes through EOF. The configured size limit also applies at upload. Zero-byte
input is valid for a zero-byte registration. There is no whole-file buffering,
JSONL parsing, scanner inference from MIME type, or scan-content validation.

Before writing the private storage key, the backend atomically and durably sets
`uploadStartedAt` once on an eligible unused registration. No database transaction
stays open during the transfer. Concurrent losers and all later uploads receive
`409`, without writing or compensating the winning request's bytes. The marker
survives success, failure, cancellation, crashes, and cleanup; available, failed,
or deleted sources cannot be overwritten. Pre-claim authentication and validation
failures do not consume an attempt. Unused registrations never expire, while a
claimed registration is never reusable.

Only after exact-byte storage and durable source availability succeed does one
database transaction create the ingestion, link the available unlinked source,
and create its outbox job. A failed transfer creates none of them; a rolled-back
transaction leaves no partial ingestion, link, or job. Success returns HTTP `202`:

```json
{
  "correlationId": "request-correlation-id",
  "data": {
    "importSourceId": "550e8400-e29b-41d4-a716-446655440000",
    "ingestionId": "550e8400-e29b-41d4-a716-446655440001",
    "jobId": "550e8400-e29b-41d4-a716-446655440002"
  }
}
```

This promises durable acceptance, not broker publication, worker execution, or
imported observations. The existing API relay publishes the job asynchronously;
the worker's complete real handler set activates consumption automatically.

The upload request uses `IMPORT_SOURCE_UPLOAD_TIMEOUT_MS` (default `300000`, five
minutes), separate from ordinary `API_TIMEOUT_MS` (default `5000`), which still
applies to registration. On deadline or disconnection, middleware aborts the
transfer, awaits settlement, and prevents submission that has not begun; it does
not return a timeout while leaving the transfer running. Cancellation cannot
retract a committed transaction. The HTTP server's `requestTimeout` is the upload
deadline plus `60000` ms to allow for Node's default header-receipt budget before
the application timer starts; `headersTimeout` retains its existing default. See
[operator guidance](deployment.md#upload-deadlines-and-recovery) for shutdown and proxy configuration.

Once the source is durably available, a later abort, submission failure, or lost
response never triggers byte deletion, including an ambiguous database commit.
Submission failure logs the safe source ID for diagnosis. Recovery requires a new
registration and upload, not another PUT to the consumed ID; an ambiguous response
may therefore lead to a separate, duplicate submission. No request deduplication,
same-ID upload retry, resumable upload, expiry, automatic cleanup, or status
endpoint is provided.

## Worker Processing Shell

The production handler calls the high-level backend `Ingestions.process(ingestionId)`.
It resolves the linked import source, rejects missing or unavailable input, and
reads through the existing import-source/storage capabilities with lifecycle and
recorded-bucket checks intact. The whole stream is consumed to discard with byte
counting, not accumulated in memory. Only EOF with `bytesRead === source.sizeBytes`
resolves with `{ importSourceId, bytesRead }`; a clean-EOF size mismatch raises
`import_source.read_failed`. Lookup and read failures, including errors after
partial reads, propagate to the existing consumer's broker retry/dead-letter
policy with no application retry layer or permanent/transient classification.

The worker logs `ingestion shell completed` with `jobId`, `ingestionId`,
`importSourceId`, and `bytesRead`, never raw input or storage credentials. This is
log-only execution observability: the worker makes no database writes and job
execution stays `pending` on start, success, and failure. Successful reads ACK these
diagnostic jobs; published jobs are not automatically replayed when parsing is
later implemented. API relay publication updates are independent. There are no
execution claims, deduplication, or status endpoints. Duplicate deliveries safely
reread and log again without changing source metadata, links, retention, or bytes.
Nothing is deleted after a read, even for `temporary` input or after a failure.

Zero-byte and malformed scan contents are not parsed or rejected as scanner output.
Scanner parsing is not implemented. Matching, asset/vulnerability creation,
observation/finding persistence, and ingestion accounting are not implemented.
See the [stack smoke check](deployment.md#ingestion-shell-smoke-check).

## Configuration And Usage

Import `createImportSources` from `@exposurenexus/backend/import-sources`. The
signature is `createImportSources(runtime, storage, configuration = {})`;
`ImportSourcesConfiguration` has only optional `maxSizeBytes` and `retentionPolicy`.
There is no compatibility constructor or overload and no `ImportSources.close()`.
The same strict subpath exports the caller types `ImportSources`, `ImportSource`,
`RegisterImportSourceCommand`, `UploadImportSourceCommand`, and
`CreateImportSourceCommand`; storage references and persistence stay private.
The backend root still constructs only a runtime around PostgreSQL and a logger.
Apply the existing backend migrations before using the capability, including
`20260913-import-sources`, `20260913-import-sources-ingestion-link`, and the forward
`20260914-import-source-scanner` migration. The latter adds nullable scanner
`source` metadata, preserving historical sources and provenance without inventing
scanner values for unknown input. The forward `20260915-import-source-upload-attempt`
migration adds nullable `uploadStartedAt`, preserving only unused scanner
registrations as eligible and marking historical attempted sources as consumed.

The API calls `register(command: RegisterImportSourceCommand)` with `performedBy`
taken from the authenticated user, not the request body:

```ts
const source = await sources.register({
  source: "example-scanner",
  originalFilename: "scan.jsonl",
  sizeBytes: 1024,
  mimeType: "application/x-ndjson",
  performedBy: userProfileId,
});
```

`upload(command: UploadImportSourceCommand)` completes a registration using
`{ importSourceId, performedBy, body, contentLength?, signal }`: `body` is an unread
Node `Readable` yielding bytes, `contentLength` is an optional number, and `signal`
is a required `AbortSignal`. It owns the claim, upload, and finalization, returning
safe source metadata, but does not submit a job on its own. It passes cancellation
to object storage's optional `ObjectStorageWriteCommand.signal`.

The API instead calls `submit` on the high-level
`@exposurenexus/backend/ingestions` capability. Its factory is
`createIngestions(runtime, importSources)` and its
`Ingestions.submit` accepts the same `UploadImportSourceCommand`, orchestrating
upload and the submission transaction and returning
`{ importSourceId, ingestionId, jobId }`. No caller transaction callback,
standalone link operation, or direct broker publication is exposed.
The same capability exposes the read-only `process(ingestionId)` shell described
above; lookup and stream orchestration stay in backend, not worker queries.

`submit` delegates to `upload(command)` before inspecting fields or the signal.
`upload` validates at runtime, then owns consumption and destroys input on
failure or cancellation. Schema-invalid commands fail with
`import_source.invalid_input` before ownership; the caller owns any still-open
`Readable`. An initially aborted signal yields `import_source.upload_cancelled`;
later submission-phase cancellation remains `ingestion.submit_cancelled`.

The existing streamed `create` operation remains available to trusted backend
callers. It creates a separate source with `source: null`; it does not complete an
HTTP registration or submit an ingestion:

```ts
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createBackendRuntime } from "@exposurenexus/backend";
import { createImportSources } from "@exposurenexus/backend/import-sources";
import { createObjectStorage } from "@exposurenexus/backend/object-storage";

const runtime = createBackendRuntime({ database, logger });
const storage = createObjectStorage({
  bucket: "private-import-input",
  region: "us-east-1",
  credentials: { accessKeyId, secretAccessKey },
  // endpoint: "https://your-s3-service.example",
  // forcePathStyle: true,
});

try {
  const sources = createImportSources(runtime, storage, {
    maxSizeBytes: 104857600,
    retentionPolicy: "temporary",
  });
  const { size } = await stat(inputPath);
  const source = await sources.create({
    body: createReadStream(inputPath),
    sizeBytes: size,
    originalFilename: "scan.jsonl",
    mimeType: "application/x-ndjson",
    performedBy: userProfileId,
  });
  const metadata = await sources.getByID(source.id);
  const readable = await sources.readByID(source.id);
  // Fully consume readable, or destroy it if abandoning the read.
  await consumeInput(readable, metadata);
} finally {
  // All operations and returned streams must have stopped before closing storage.
  storage.close();
}
```

Executable composition supplies storage configuration separately from import
policy; neither module reads application environment variables, provisions
buckets, or requires auth secrets. `createObjectStorage` requires `bucket`,
`region`, and `credentials`. Credentials contain only a static `accessKeyId` and
`secretAccessKey`; async providers and session tokens are not supported. Optional
`endpoint` and `forcePathStyle` select the service's addressing. Use HTTPS outside
isolated local test infrastructure. Credentials and raw SDK/database errors are
not included in capability metadata, creation error details, or capability logs.

Each import-source factory invocation snapshots the handle's bound bucket and
its size and retention policy. It does not construct an SDK client or own a
lifecycle. Multiple capability instances can share a handle. The composing caller
must stop all consumers, settle their operations, and finish or destroy returned
read streams before calling `storage.close()` once. Closing releases SDK
connections; it does not drain work, delete source bytes, or close PostgreSQL.
The API creates and owns storage in its application lifecycle, closing it after
HTTP requests, tracked upload work, and the outbox relay settle, and on startup failure.
Upload work is tracked independently of socket lifetime; shutdown cancels and
awaits it before closing storage or PostgreSQL, within the existing bounded
shutdown deadline. Both roles validate storage configuration only, with no connectivity or
bucket probe. The worker owns a separate handle, closes it on startup failure, and
retains it until accepted reads drain before normal shutdown closure. A failed or
hung drain leaves storage open until bounded nonzero exit; unfinished deliveries
remain unacknowledged for redelivery. See [API and worker storage configuration](deployment.md#api-and-worker-storage-configuration)
and [local development](development.md#configure-the-api).

## Historical References

Before reading or deleting bytes, the capability compares the recorded bucket
with its bound-bucket snapshot. A mismatch throws `import_source.bucket_mismatch`,
kind `conflict`, with details containing only `{ sourceId: string }`. No object
read or deletion occurs, and availability, deletion, and cleanup metadata remain
unchanged; public results and errors expose neither bucket nor key. Read
eligibility and already-deleted checks take precedence: unavailable reads still
fail with `import_source.not_available`, and deleting an already-deleted source
remains a no-op, even with a differently bound handle.

`getByID` and `getByIngestionID` do not contact storage or depend on its bound
bucket. They still resolve metadata for incomplete, deleted, and differently
bucketed sources. Accessing a historical object's bytes requires composing the
capability with the correct handle; there is no handle registry, historical-bucket
routing, fallback, or relocation of persisted objects.

Bucket equality checks do not prove endpoint/account continuity. Operators must
retain access to the correct original endpoint, account, and bucket when resolving
historical references. Bucket and key remain privately persisted; endpoint and
credentials remain deployment configuration, not recorded routing information.

## Storage Requirements

Use a preprovisioned private bucket with public access blocked. Credentials need
`s3:PutObject`, `s3:GetObject`, and `s3:DeleteObject` for the API capability's
`import-sources/` keys. Deletion permission is necessary for failed-write
compensation and explicit deletion. Bucket
listing, bucket creation, ACL modification, and multipart permissions are not used.
Encryption and any additional KMS permissions belong to bucket provisioning.
The read-only worker shell needs only `s3:GetObject` for the same input objects;
separate restricted credentials may be used within the same storage account.

The object-storage module alone uses the official `@aws-sdk/client-s3` for single
`PutObject`, streamed `GetObject`, and `DeleteObject` requests. Import sources call
its byte interface, including when compensating or explicitly deleting. Automatic retries are disabled because
the input stream cannot be replayed. Checksum calculation/validation is configured
as `WHEN_REQUIRED`, avoiding automatic checksum-trailer framing for arbitrary
Node stream chunks. Storage checks byte counts, not a cryptographic content hash.
An S3-compatible deployment must support these SDK operations; an in-memory
storage double is not proof of interoperability.

The feature generates `import-sources/<random UUID>` keys independently of the
original filename and source ID.
Results expose a durable source UUID, not a key, URL, or presigned URL. There is no
overwrite operation, conditional write, or versioning requirement. Write-once is
an application convention, not protection from administrators or other holders of
write credentials. Direct-to-storage browser uploads must revisit that assumption. Avoid bucket
lifecycle expiration rules that would delete retained or still-needed input.
Use an unversioned bucket for byte removal: on a versioned bucket, S3's unqualified
delete only creates a delete marker and retains older bytes. Version cleanup and
Object Lock bypass are not implemented by this capability.

## Streams And Lifecycle

Library creation requires an unread Node `Readable` yielding bytes and a nonnegative
safe integer `sizeBytes` in `CreateImportSourceCommand`. Registered uploads use the
stored `sizeBytes` instead. Empty input is supported. Unknown declared lengths are
not supported; an absent HTTP `Content-Length` is supported because registration
already supplies the exact size. Whole-file buffering, multipart uploads, and
resumable uploads are not supported. The default maximum is 100 MiB (`104857600` bytes);
`maxSizeBytes` may set a different
nonnegative safe integer limit. Storage service single-PUT limits still apply.
Invalid/oversized declarations are rejected without consuming the stream; the
caller retains responsibility for disposing of that rejected input. Once a valid
creation starts, the capability owns consumption and destroys input on failure.

The capability reserves complete metadata and the exact bucket/key reference in
PostgreSQL before sending bytes. It handles stream errors while reservation is
pending without an unhandled error and destroys input if reservation fails. An
input failing after initial command validation still receives failed-creation
bookkeeping once its record is reserved.

Storage then owns transfer and counts bytes with backpressure, rejects an overrun
before forwarding the offending chunk, and requires EOF at exactly the declared
length. The feature passes `sizeBytes` as storage's `expectedSizeBytes` without a
second byte counter: a successful write verifies the reserved size rather than
adding a separate observed size during finalization. Availability requires both
successful storage and database finalization. A file changing between `stat` and
reading therefore fails rather than becoming truncated input.

`getByID` returns `null` for unknown identities. Otherwise `ImportSource` metadata
includes `ingestionId`, nullable scanner `source`, `createdBy`, `originalFilename`,
`mimeType`, `sizeBytes`, the retention snapshot, lifecycle state, nullable
`uploadStartedAt`, and creation/availability/failure/deletion
timestamps. `sizeBytes` is the only size field in the creation command, public
metadata, and database. For incomplete sources it is the declared byte length;
successful availability confirms exactly that many bytes were received. Failed
creation retains the declaration, not an observed size from storage errors, even
for fully observed short input. Actor references point to existing user profiles
with deletion restricted. The persisted `sizeBytes` uses PostgreSQL double
precision constrained to safe, nonnegative integer values, preserving the public
numeric shape without driver-specific bigint strings.

Creation accepts optional caller-supplied `mimeType`. Metadata returns it as a
nullable string: omitted or blank declarations become `null`, while nonblank
declarations are preserved. It is unverified provenance, retained even for failed
uploads and after byte deletion. The capability does not infer a MIME type from
filenames or bytes, select a parser, or set S3 `ContentType` from this declaration.

Only `available` sources with no deletion timestamp can be read. Incomplete and
deleted states are rejected. An unexpectedly absent object is a typed
`import_source.read_failed` error, not an empty stream. After `readByID` resolves,
normal Node stream errors must also be handled while consuming the returned body.

## Ingestion References

Each source starts unattached (`ingestionId: null`). Its optional ingestion
reference is foreign-key enforced and unique: a source belongs to at most one
ingestion, and an ingestion identifies at most one source. Linked sources restrict
ingestion deletion. Existing ingestions and their observations retain their
original provenance; the migration neither invents source objects nor attaches
previously stored input automatically. An ingestion is not an upload placeholder.

`await sources.getByIngestionID(ingestionId)` returns the same safe metadata as
`getByID`, including the source ID and nullable ingestion ID, without contacting
S3. It returns `null` when no source is linked, including unknown ingestions and
preexisting ingestions without stored input. Database failures throw
`import_source.get_by_ingestion_failed` with the ingestion ID in internal details.
Callers pass the returned source ID to `readByID` or `deleteByID`; bucket/key lookup
stays private. Metadata resolution does not promise byte availability: missing
objects and explicitly deleted bytes do not erase the relationship or provenance.

Ingestion actor and scanner source remain authoritative in `ingestion.createdBy`
and `ingestion.source` once an ingestion exists. Before
submission, the registered scanner declaration, creator, and input reference live
in import-source metadata. [Ingestion job data](job-queue.md#ingestion-handoff)
contains only `{ ingestionId }`, never a duplicate actor/format, bytes, URL, or
credentials. Backend `Ingestions.submit` creates the ingestion with the registered
scanner source and creator, guards the available source against replacement or
duplicate linking, and inserts the outbox job in the same transaction through
`JobService` and a transaction-bound jobs PostgreSQL repository. Publication belongs
to the existing API relay, not the upload request.

The processing shell resolves and reads through this relationship without mutations.
There is no public standalone link operation. Parsing/persistence, execution
idempotency for future business effects, and cleanup decisions based on durable
ingestion outcomes remain deferred.
Retention does not enable source reuse across ingestions or reprocessing.

## Failures And Retention

Caught transfer, length-check, or finalization failures attempt best-effort object
cleanup after storage has settled the local upload, provided unavailability is
established. Storage does not delete failed writes itself; the feature decides
whether to compensate and records the outcome. It translates typed storage
failures into `import_source.create_failed` with `sourceId`, `reason`
(`size_mismatch`, `transfer_failed`, or `finalization_failed`), and `cleanupRequired`
(`boolean`). Callers can inspect the reserved metadata
by source ID. No raw external exception or storage error details are attached.

Transfer and length-check failures leave the reserved record `incomplete`.
Finalization errors are different: PostgreSQL may have committed `available`
before its response was lost. The capability first durably records
`state: "incomplete"` and `cleanupRequired: true` before attempting destructive
compensation in that case.
If that update cannot be confirmed, it preserves the object and reports
`cleanupRequired: true` in the error, with a safe structured log identifying
the source. Metadata may still be `available` and the valid bytes may remain
readable despite creation rejecting. It is impossible to guarantee that a rejected
create is never available while the database outcome is unresolved. Once the
database is accessible, inspect the reported source ID and explicitly delete it
if the bytes are no longer needed; there is no automatic reconciliation.

`cleanupRequired` is `true` for reserved sources and unresolved or failed cleanup;
it becomes `false` when creation succeeds without requiring cleanup or storage
deletion is confirmed. Pending and failed cleanup are deliberately not distinguished.
If recording successful cleanup fails, the record remains unavailable but the
stored flag may still be `true`. An error's flag describes the observed recovery
outcome, not proof of current database state. The flag alone never authorizes
deletion of an active upload or available source; lifecycle safeguards still apply.
`failedAt` distinguishes recorded failures from interrupted or unrecorded attempts.
`uploadStartedAt` independently records a consumed attempt and is never cleared by
failure bookkeeping or deletion. A null `failedAt` does not make an attempted
upload eligible again.

These compensation rules concern transfer and source-finalization failures, not
ingestion submission. After durable availability succeeds, later cancellation or
submission failure preserves the input even if the submission commit outcome is
uncertain. Inspect the safely logged source ID; there is no status endpoint or
automatic reconciliation, and recovery requires a new registration and upload.

PostgreSQL and S3 do not share a transaction. Process crashes, ambiguous remote
request outcomes, failed cleanup, and never-submitted sources can leave orphans;
there is no automatic reclamation guarantee or operator cleanup tool. A successful
cleanup response is not a cross-system atomicity guarantee. Preserve incomplete
records for investigation rather than removing the only object reference.

Retention is snapshotted per creation: `temporary` by default, or deployment-wide
`keep`. Later factory configuration affects new sources only. Neither policy
expires or deletes bytes automatically, and there is no per-import override.
`keep` is intent, not a regulatory lock. The worker never cleans up after shell
completion or failure, including `temporary` input. Retained inputs and abandoned
registrations accumulate until cleanup is implemented or explicitly performed.

## Explicit Deletion

`await sources.deleteByID(sourceId)` removes bytes using the stored object
reference after the bucket check, regardless of whether the source records
`temporary` or `keep`.
The caller decides when input is no longer needed; the capability does not inspect
ingestion outcomes, schedule deletion/expiry, or activate worker cleanup. Creation
must have finished or been abandoned before requesting cleanup. Crash-abandoned,
failed, and never-submitted sources still require explicit cleanup.

Successful deletion resolves without a return value. The source record remains
inspectable through `getByID`, retaining its identity, scanner source, actor,
filename, MIME type, `sizeBytes`, retention snapshot, and prior lifecycle timestamps.
Only `state`, `deletedAt`, and `cleanupRequired` change to `deleted`, the deletion
recording time, and `false`. No record or ingestion relationship is removed.
Subsequent reads fail with `import_source.not_available`.

Deletion is repeatable: an already-recorded deletion succeeds without object I/O
or changing its timestamp, and storage accepts deletion of an already-absent key.
Overlapping deletes preserve the first recorded deletion timestamp. An unknown source
record instead fails with `import_source.not_found`; metadata lookup failures
use `import_source.get_failed`. Unexpectedly missing bytes remain read errors
until explicit deletion records their removal.

Deletion is recorded only after storage reports success. Non-absence errors,
including permission failures, an unavailable service, or a missing bucket, throw
`import_source.delete_failed` with `reason: "storage_failed"`; they never mark
the source deleted. If storage succeeds but database bookkeeping fails, the same
error code carries `reason: "bookkeeping_failed"`. Retry `deleteByID` with the same
source ID to finish bookkeeping against the absent object. Until that succeeds,
metadata may still say `available` even though reads fail. A lost database response
can also mean deletion was recorded despite the error; lookup and retry are safe.

## Verification

The [deployment smoke check](deployment.md#ingestion-shell-smoke-check) exercises
authenticated/CSRF-protected registration and upload through real storage, the API
relay, broker, and worker. It correlates all three IDs and the full byte count in
logs with read-only SQL showing an available source, pending execution, and no
observations. It does not delete the submitted input. If dependencies are unavailable,
record the smoke check as not run, separately from unit-test results.

PGlite-backed public-capability tests inject an in-memory `ObjectStorage` handle
with targeted failure injection, not SDK mocks. They cover provenance round trips,
retention, input policy, reservation-time stream failures, failed storage, and finalization/compensation failures,
including committed finalization with a lost response and unavailable bookkeeping.
They verify that creation recovery revokes availability before deleting bytes,
and cover explicit deletion under both policies, missing objects, repeated calls,
storage failures, bookkeeping retry, concurrent deletion, and preserved provenance. Ingestion lookup
tests cover unattached sources and provenance after missing/deleted bytes. The
central migration-chain tests cover foreign keys, uniqueness, and preservation of
preexisting ingestion/observation provenance without manufactured sources. Bucket
mismatch regressions verify no wrong-bucket reads/deletes or metadata mutation,
independent metadata access, and read/deletion precedence. Ownership tests verify
shared handles and caller-owned shutdown. Transfer mechanics and SDK mocks belong
to object-storage tests. Export/caller-type tests pin the injected signature,
policy-only configuration, lifecycle-free capability, safe results and mismatch
details, and strict public subpaths while keeping storage/persistence internals private.

An opt-in real-S3 smoke test composes `createObjectStorage` and the domain capability
with an isolated in-memory database. It exercises bounded streamed input,
explicit/repeated deletion, and reading/deleting an already-absent test-owned
object. It uses no SDK imports, mocks, or separate cleanup client; the same real
handle removes only test-owned objects and is closed once after operations and
streams stop. Configure these variables in the test process, not in production
application composition:

| Variable                                  | Requirement                                        |
| ----------------------------------------- | -------------------------------------------------- |
| `IMPORT_SOURCE_S3_TEST_BUCKET`            | Required preprovisioned private test bucket        |
| `IMPORT_SOURCE_S3_TEST_REGION`            | Required signing region                            |
| `IMPORT_SOURCE_S3_TEST_ACCESS_KEY_ID`     | Required test credential                           |
| `IMPORT_SOURCE_S3_TEST_SECRET_ACCESS_KEY` | Required test secret                               |
| `IMPORT_SOURCE_S3_TEST_ENDPOINT`          | Optional S3-compatible endpoint                    |
| `IMPORT_SOURCE_S3_TEST_FORCE_PATH_STYLE`  | Set `true` if the service requires path addressing |

```bash
pnpm --filter @exposurenexus/backend test src/features/import-sources
```

Without the required infrastructure configuration, the real-S3 test is explicitly
skipped. Once configured, connection, permission, interoperability, and cleanup
errors fail the test instead of being relabeled as skips. Cleanup attempts only
the exact object references reserved in that test's private database, including
failed creations. It never lists or sweeps the bucket, deletes unrelated objects,
or provisions/destroys infrastructure.
