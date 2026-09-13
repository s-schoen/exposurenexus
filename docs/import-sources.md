# Import Sources

The shared backend provides a library-only capability for storing and reading raw
import input. It is independent of ingestion execution and HTTP authentication.
There is no working HTTP import endpoint, ingestion submission/linkage, or active
worker handler in this slice. S3 is not a required API or worker startup dependency.

## Configuration And Usage

Import `createImportSources` from `@exposurenexus/backend/import-sources`. The
backend root still constructs only a runtime around PostgreSQL and a logger.
Apply backend migrations before using the capability, including
`20260913-import-sources`.

```ts
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createBackendRuntime } from "@exposurenexus/backend";
import { createImportSources } from "@exposurenexus/backend/import-sources";

const runtime = createBackendRuntime({ database, logger });
const sources = createImportSources(runtime, {
  bucket: "private-import-input",
  region: "us-east-1",
  credentials: credentialProvider,
  // endpoint: "https://your-s3-service.example",
  // forcePathStyle: true,
  maxSizeBytes: 104857600,
  retentionPolicy: "temporary",
});

try {
  const { size } = await stat(inputPath);
  const source = await sources.create({
    body: createReadStream(inputPath),
    expectedSize: size,
    originalFilename: "scan.jsonl",
    performedBy: userProfileId,
  });
  const metadata = await sources.getByID(source.id);
  const readable = await sources.readByID(source.id);
  // Fully consume readable, or destroy it if abandoning the read.
  await consumeInput(readable, metadata);
} finally {
  sources.close();
}
```

Executable composition supplies configuration; the capability does not read
application environment variables, provision buckets, or require auth secrets.
`bucket`, `region`, and `credentials` are required. Credentials accept the official
AWS SDK credential identity or async provider, so callers can select renewable
workload credentials instead of hardcoding keys. Optional `endpoint` and
`forcePathStyle` select the service's addressing. Use HTTPS outside isolated local
test infrastructure. Credentials and raw SDK/database errors are not included in
capability metadata, creation error details, or capability logs.

Each factory invocation owns an independent S3 client and snapshots its size and
retention configuration. Unlike runtime-memoized database-only capabilities, it
must be closed explicitly after operations and read streams have drained. `close()`
releases SDK connections; it does not delete source bytes or close PostgreSQL.
Retain the same storage endpoint/account when resolving old sources; bucket and
key are recorded privately, but endpoint credentials remain deployment configuration.

## Storage Requirements

Use a preprovisioned private bucket with public access blocked. Credentials need
`s3:PutObject`, `s3:GetObject`, and `s3:DeleteObject` for the capability's
`import-sources/` keys. Deletion permission is necessary for failed-write
compensation even though public explicit deletion is not implemented yet. Bucket
listing, bucket creation, ACL modification, and multipart permissions are not used.
Encryption and any additional KMS permissions belong to bucket provisioning.

The official `@aws-sdk/client-s3` uses single `PutObject`, streamed `GetObject`,
and compensating `DeleteObject` requests. Automatic retries are disabled because
the input stream cannot be replayed. Checksum calculation/validation is configured
as `WHEN_REQUIRED`, avoiding automatic checksum-trailer framing for arbitrary
Node stream chunks. The capability checks byte counts, not a cryptographic content
hash. An S3-compatible deployment must support these SDK operations; the unit
storage double is not proof of interoperability.

Keys are random, generated independently of the original filename and source ID.
Results expose a durable source UUID, not a key, URL, or presigned URL. There is no
overwrite operation, conditional write, or versioning requirement. Write-once is
an application convention, not protection from administrators or other holders of
write credentials. Browser uploads must revisit that assumption. Avoid bucket
lifecycle expiration rules that would delete retained or still-needed input.

## Streams And Lifecycle

Creation requires an unread Node `Readable` yielding bytes and a nonnegative safe
integer `expectedSize`. Empty input is supported. Unknown-length input, whole-file
buffering, multipart uploads, and resumable uploads are not supported. The default
maximum is 100 MiB (`104857600` bytes); `maxSizeBytes` may set a different
nonnegative safe integer limit. Storage service single-PUT limits still apply.
Invalid/oversized declarations are rejected without consuming the stream; the
caller retains responsibility for disposing of that rejected input. Once a valid
creation starts, the capability owns consumption and destroys input on failure.

The capability reserves an independent PostgreSQL record before sending bytes.
It counts bytes with backpressure, rejects an overrun before forwarding the
offending chunk, and requires EOF at exactly the declared length. Availability
requires both successful storage and exact-length completion. A file changing
between `stat` and reading therefore fails rather than becoming truncated input.

`getByID` returns `null` for unknown identities. Otherwise metadata includes
`createdBy`, `originalFilename`, `expectedSize`, `actualSize`, the retention
snapshot, lifecycle state, and creation/availability/failure/deletion timestamps.
`actualSize` is known after complete input reaches EOF; interrupted or overlong
input may leave it `null`, not a misleading partial-file total. Actor references
point to existing user profiles with deletion restricted. Metadata byte counts use
PostgreSQL double precision constrained to safe, nonnegative integer values,
preserving the public numeric shape without driver-specific bigint strings.

Only `available` sources with no deletion timestamp can be read. Incomplete and
future deleted states are rejected. An unexpectedly absent object is a typed
`import_source.read_failed` error, not an empty stream. After `readByID` resolves,
normal Node stream errors must also be handled while consuming the returned body.

## Failures And Retention

Caught transfer, length-check, or finalization failures attempt best-effort object
cleanup after stopping the local upload, provided unavailability is established.
They throw `import_source.create_failed`
with `sourceId`, a safe failure category, and cleanup outcome. Callers can use the
source ID to inspect the reserved metadata. No raw external exception is attached.

Transfer and length-check failures leave the reserved record `incomplete`.
Finalization errors are different: PostgreSQL may have committed `available`
before its response was lost. The capability first durably records
`incomplete`/`pending` before attempting destructive compensation in that case.
If that update cannot be confirmed, it preserves the object and reports
`cleanupState: "pending"` in the error, with a safe structured log identifying
the source. Metadata may still be `available` and the valid bytes may remain
readable despite creation rejecting. It is impossible to guarantee that a rejected
create is never available while the database outcome is unresolved. Once the
database is accessible, inspect the reported source ID; there is no automatic
reconciliation or public cleanup/recovery operation in this slice.

After unavailability is established, `cleanupState` is `completed` only when
storage deletion succeeded, or `failed` if deletion failed. If recording that
outcome fails, the record remains unavailable but its cleanup metadata may still
be `pending`. A pending outcome does not claim that cleanup happened, nor does an
error's pending outcome establish the current database state. `failedAt`
distinguishes recorded failures from interrupted or unrecorded attempts.

PostgreSQL and S3 do not share a transaction. Process crashes, ambiguous remote
request outcomes, failed cleanup, and never-submitted sources can leave orphans;
there is no automatic reclamation guarantee or operator cleanup tool. A successful
cleanup response is not a cross-system atomicity guarantee. Preserve incomplete
records for investigation rather than removing the only object reference.

Retention is snapshotted per creation: `temporary` by default, or deployment-wide
`keep`. Later factory configuration affects new sources only. Neither policy
expires or deletes bytes automatically, and there is no per-import override.
`keep` is intent, not a regulatory lock. Public deletion, ingestion relationships,
and ingestion-only job contracts are separate tickets, not available behavior here.

## Verification

PGlite-backed public-capability tests cover byte/provenance round trips, retention,
limits, interruption, failed storage, and finalization/compensation failures,
including committed finalization with a lost response and unavailable bookkeeping.
They verify that recovery revokes availability before deleting bytes. The
central migration-chain tests cover schema integration, and export tests keep
storage and persistence internals private.

An opt-in real-S3 smoke test uses an isolated in-memory database and bounded
streamed input. Configure these variables in the test process, not in production
application composition:

| Variable                                  | Requirement                                        |
| ----------------------------------------- | -------------------------------------------------- |
| `IMPORT_SOURCE_S3_TEST_BUCKET`            | Required preprovisioned private test bucket        |
| `IMPORT_SOURCE_S3_TEST_REGION`            | Required signing region                            |
| `IMPORT_SOURCE_S3_TEST_ACCESS_KEY_ID`     | Required test credential                           |
| `IMPORT_SOURCE_S3_TEST_SECRET_ACCESS_KEY` | Required test secret                               |
| `IMPORT_SOURCE_S3_TEST_SESSION_TOKEN`     | Optional temporary-credential token                |
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
