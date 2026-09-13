# Import Sources

The shared backend provides a library-only capability for storing, reading, and
explicitly deleting raw import input while preserving provenance. It is independent
of ingestion execution and HTTP authentication.
Persisted ingestion linkage and lookup are available, but there is no working HTTP
import endpoint, ingestion submission workflow, or active worker handler. S3 is
not a required API or worker startup dependency.

The capability borrows an explicitly injected, bucket-bound
[Object Storage](object-storage.md) handle. Storage owns bytes, SDK access, exact
byte counting, cancellation, and transfer settlement; import sources own policy,
provenance, metadata, finalization, and compensation decisions. The composing
caller owns storage shutdown, not the capability.

## Configuration And Usage

Import `createImportSources` from `@exposurenexus/backend/import-sources`. The
signature is `createImportSources(runtime, storage, configuration = {})`;
`ImportSourcesConfiguration` has only optional `maxSizeBytes` and `retentionPolicy`.
There is no compatibility constructor or overload and no `ImportSources.close()`.
The same strict subpath exports the caller types `ImportSources`, `ImportSource`,
and `CreateImportSourceCommand`; storage references and persistence stay private.
The backend root still constructs only a runtime around PostgreSQL and a logger.
Apply the existing backend migrations before using the capability, including
`20260913-import-sources` and `20260913-import-sources-ingestion-link`.
Storage injection requires no new migration or source records.

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
Production API/worker composition and storage startup checks remain deferred.

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
`s3:PutObject`, `s3:GetObject`, and `s3:DeleteObject` for the capability's
`import-sources/` keys. Deletion permission is necessary for failed-write
compensation and explicit deletion. Bucket
listing, bucket creation, ACL modification, and multipart permissions are not used.
Encryption and any additional KMS permissions belong to bucket provisioning.

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
write credentials. Browser uploads must revisit that assumption. Avoid bucket
lifecycle expiration rules that would delete retained or still-needed input.
Use an unversioned bucket for byte removal: on a versioned bucket, S3's unqualified
delete only creates a delete marker and retains older bytes. Version cleanup and
Object Lock bypass are not implemented by this capability.

## Streams And Lifecycle

Creation requires an unread Node `Readable` yielding bytes and a nonnegative safe
integer `sizeBytes` in `CreateImportSourceCommand`. Empty input is supported.
Unknown-length input, whole-file buffering, multipart uploads, and resumable uploads
are not supported. The default maximum is 100 MiB (`104857600` bytes);
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
includes `ingestionId`, `createdBy`, `originalFilename`, `mimeType`, `sizeBytes`, the
retention snapshot, lifecycle state, and creation/availability/failure/deletion
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
and `ingestion.source` (currently `nuclei`). Source creation attribution and the
input reference remain in import-source metadata. [Ingestion job data](job-queue.md#ingestion-handoff)
contains only `{ ingestionId }`, never a duplicate actor/format, bytes, URL, or
credentials. A future backend ingestion use case will resolve these records;
there is no processing facade or public standalone link operation in this slice.

The later submission use case must atomically link the source to the ingestion
and insert its outbox job. Submission validation, processing, execution idempotency,
and cleanup decisions based on durable ingestion outcomes remain deferred.
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

PostgreSQL and S3 do not share a transaction. Process crashes, ambiguous remote
request outcomes, failed cleanup, and never-submitted sources can leave orphans;
there is no automatic reclamation guarantee or operator cleanup tool. A successful
cleanup response is not a cross-system atomicity guarantee. Preserve incomplete
records for investigation rather than removing the only object reference.

Retention is snapshotted per creation: `temporary` by default, or deployment-wide
`keep`. Later factory configuration affects new sources only. Neither policy
expires or deletes bytes automatically, and there is no per-import override.
`keep` is intent, not a regulatory lock.

## Explicit Deletion

`await sources.deleteByID(sourceId)` removes bytes using the stored object
reference after the bucket check, regardless of whether the source records
`temporary` or `keep`.
The caller decides when input is no longer needed; the capability does not inspect
ingestion outcomes, schedule deletion/expiry, or activate worker cleanup. Creation
must have finished or been abandoned before requesting cleanup. Crash-abandoned,
failed, and never-submitted sources still require explicit cleanup.

Successful deletion resolves without a return value. The source record remains
inspectable through `getByID`, retaining its identity, actor, filename, MIME type,
`sizeBytes`, retention snapshot, and prior lifecycle timestamps.
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
