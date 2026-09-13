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
Closing releases client resources, not objects; it is not a drain operation.

Historical references require the same bucket and storage endpoint/account.
Configuration validation does not verify account identity, and the module does
not route keys to historical buckets or relocate objects.

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
default), retention, and compensation. There is no database coordination,
automatic cleanup, unknown-length/multipart/resumable upload, retry policy,
additional provider implementation, or provider registry.

## Migration And Verification

Import sources still use their existing SDK implementation, configuration, and
`ImportSources.close()`; injection of this handle is deferred to ticket 02. API and
worker production composition remain deferred. See [Import Sources](import-sources.md)
and the deliberate [ADR-0006 refinement](adr/0006-s3-backed-import-sources.md#reusable-storage-refinement).

Storage unit tests exercise the public interface with SDK mocks and no PostgreSQL
dependency. They do not prove S3 interoperability. The existing opt-in real-S3
test remains with import sources and will compose this module in ticket 02; no
separate real-S3 integration project is introduced here.
