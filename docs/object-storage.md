# Object Storage

`@exposurenexus/backend/object-storage` provides reusable, bucket-bound S3 byte
storage for trusted backend callers. It is infrastructure inside the backend
package, not an import-source feature or another workspace package. Construction
requires no database or backend runtime and performs no startup I/O, environment
lookup, bucket provisioning, or connectivity check.

## Public Interface

The strict subpath exports `createObjectStorage` and the three caller-facing types
below. SDK clients and commands remain private, not an alternative operational
interface.

```ts
import type { Readable } from "node:stream";
import type { S3ClientConfig } from "@aws-sdk/client-s3";

interface ObjectStorageConfiguration {
  bucket: string;
  region: string;
  credentials: NonNullable<S3ClientConfig["credentials"]>;
  endpoint?: string;
  forcePathStyle?: boolean;
}

interface ObjectStorageWriteCommand {
  key: string;
  body: Readable;
  expectedSize: number;
}

interface ObjectStorage {
  readonly bucket: string;
  write(command: ObjectStorageWriteCommand): Promise<void>;
  read(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  close(): void;
}

declare function createObjectStorage(config: ObjectStorageConfiguration): ObjectStorage;
```

## Configuration And Ownership

Supply a preprovisioned private bucket, signing region, and explicit credential
identity or async provider; credentials are required rather than discovered from
the application environment. Optional `endpoint` and `forcePathStyle` select the
service and addressing. The factory validates and snapshots configuration. Its
read-only `bucket` getter exposes the bound identity; later configuration mutation
cannot retarget the handle. An async provider may refresh credentials.

The composing caller owns the handle and underlying client's lifetime. Multiple
capabilities may share it without global registration. Stop all consumers, settle
operations, and finish or destroy returned read streams before calling `close()`.
Borrowing capabilities, including import sources, never close it. The owner closes
it once, releasing client resources, not objects; this is not a drain operation.

Historical references require the correct original bucket and storage
endpoint/account. Neither configuration validation nor bucket equality proves
endpoint/account continuity. Import sources compare their recorded bucket with
the injected handle's bound-bucket snapshot before byte reads/deletes, but
operators still own endpoint/account continuity. The module does not register
handles, route keys to historical buckets, or relocate objects.

## Streams And Errors

`write` requires a Node `Readable` yielding bytes and a nonnegative safe-integer
`expectedSize`, including zero. Invalid declarations and non-readable, destroyed,
or ended inputs are rejected before transfer or consumption; the caller retains
ownership and must dispose of rejected input. Once a valid write starts, storage
owns consumption, cancellation, and destruction of the relevant streams.

Byte counting preserves backpressure without whole-file buffering. Success means
both input consumption and upload completed with exactly the declared byte count;
there is no upload metadata result. Short input at EOF and in-flight overruns fail.
On failure, storage cancels the upload, destroys the relevant streams (including
blocked input), and awaits local pipeline and upload settlement before rejecting.
Non-byte chunks and input interruption are transfer failures.

Failures use the shared `ApplicationError` contract, with safe messages and details
rather than credentials or raw SDK exceptions in operation rejections:

| Code                                   | Kind         | Meaning                                 |
| -------------------------------------- | ------------ | --------------------------------------- |
| `object_storage.invalid_configuration` | `validation` | Invalid factory configuration           |
| `object_storage.invalid_input`         | `validation` | Invalid input rejected before transfer  |
| `object_storage.write_failed`          | `unexpected` | Size mismatch or transfer failure       |
| `object_storage.read_failed`           | `unexpected` | Could not obtain a readable object body |
| `object_storage.delete_failed`         | `unexpected` | Object deletion failed                  |

`write_failed.details` contains `reason` (`size_mismatch` or `transfer_failed`) and
`actualSize` (`number | null`). A size is known only when complete input was
observed: short EOF has a known size, as can full EOF before a storage failure.
Overruns and interrupted input report `null`, never a partial count as the full size.

`read` returns a stream, not buffered bytes. A missing object or missing readable
response body is `object_storage.read_failed`, not an empty successful read.
After the stream is returned, later stream errors remain the consuming caller's
responsibility; they cannot become rejections of the already-resolved operation.

A failed write never deletes an object internally. Local settlement does not
establish remote absence: the caller decides whether to compensate after failure
settles. `delete` succeeds for an already-absent key, retaining S3 semantics; an
unqualified delete does not guarantee removal of all versions in a versioned
bucket.

## S3 And Policy

The official AWS S3 SDK uses a single `PutObject`, streamed `GetObject`, and
`DeleteObject`, with one attempt (`maxAttempts: 1`) because input cannot be
replayed. Request checksum calculation and response checksum validation are both
`WHEN_REQUIRED`. Service single-PUT limits still apply; byte counting is not a
cryptographic content hash.

Trusted callers choose keys, which are passed through without generation,
prefixing, filename interpretation, or feature-specific routing. Write-once is a
caller convention, not conditional-write enforcement or a versioning requirement.
Consumers own metadata, allowed-size policy (including import sources' 100 MiB
default), provenance, retention, finalization, and compensation decisions. Storage
owns SDK access and transfer settlement, not those domain lifecycle rules.
There is no database coordination,
automatic cleanup, unknown-length/multipart/resumable upload, retry policy,
additional provider implementation, or provider registry.

## Import Sources

Import sources now use `createImportSources(runtime, storage, configuration = {})`.
The optional configuration contains only `maxSizeBytes` and `retentionPolicy`;
SDK settings belong solely to `createObjectStorage`. There is no compatibility
constructor or `ImportSources.close()`. The feature snapshots the bound bucket,
generates its own keys, and uses storage's successful-write guarantee and safe
failure facts without a second byte counter. It reserves metadata before writing,
translates storage errors into its domain contract, and chooses compensation only
after transfer settlement and, for ambiguous finalization, confirmed durable
unavailability.

A recorded-bucket mismatch rejects a byte read/delete as
`import_source.bucket_mismatch`, kind `conflict`, with details containing only
`{ sourceId: string }`; no storage reference leaks or metadata mutations occur.
Already-deleted deletion remains a no-op and unavailable reads still reject as
`import_source.not_available`. Metadata lookup by source or ingestion ID remains
independent of the bound bucket. No registry or historical routing is provided.

API and worker production composition and storage startup checks remain deferred:
the import HTTP endpoint is unavailable and the worker stays connected but idle.
Storage is not a mandatory backend-runtime or application-startup dependency.
See [Import Sources](import-sources.md) for executable usage and the deliberate
[ADR-0006 refinement](adr/0006-s3-backed-import-sources.md#reusable-storage-refinement).

## Verification

Storage unit tests exercise the public interface with SDK mocks and no PostgreSQL
dependency. Import-source domain tests instead inject an in-memory storage handle;
they test domain policy and recovery rather than duplicate SDK transfer mechanics.
Neither proves S3 interoperability. The opt-in
[real-S3 import-source test](import-sources.md#verification) composes this module
and the domain capability, using the same real handle for exact test-owned object
cleanup and closing it once at the end. It never lists or sweeps a bucket. Missing
infrastructure configuration skips the test; configured connectivity, permission,
interoperability, and cleanup failures fail it. A skip is not verified S3
interoperability; no separate real-S3 integration project is introduced here.
