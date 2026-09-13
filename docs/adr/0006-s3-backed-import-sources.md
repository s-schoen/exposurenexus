# S3-Backed Import Sources

**Status:** Accepted; storage, explicit deletion, durable references, and migration to injected reusable object storage implemented. Submission, processing, and production API/worker storage composition remain deferred.

Asynchronous ingestion needs input bytes that remain accessible independently of an HTTP request or worker host. Store raw input in private S3 object storage, track each import source in PostgreSQL, and identify an ingestion in its job rather than carrying bytes or an expiring URL. This separates file lifetime from message delivery without introducing the ingestion pipeline itself.

## Decision

### Ownership And Handoff

Add an import-source capability to the shared backend established by [ADR-0004](0004-shared-backend-capabilities.md). Callers use source creation, metadata lookup, streamed reading, and explicit deletion by source ID. The capability owns source persistence, policy, and lifecycle; an injected object-storage handle owns byte access. The worker will call the capability in-process, not through an HTTP endpoint or direct database queries.

An import source has its own identity, provenance, storage reference, and lifecycle metadata. It can exist before ingestion and belong to at most one ingestion. Retries reuse the same ingestion and source; keeping raw input does not introduce reuse across ingestions or a reprocessing feature. Deleting bytes preserves source metadata and the ingestion relationship.

Optional declared MIME type is retained as nullable source metadata, including
through failed creation and byte deletion. Missing or blank declarations remain
unknown. This is caller-supplied provenance, not verified content, parser selection,
or an S3 `ContentType` header.

Ingestion job data contains only `ingestionId`. Authoritative actor, scanner format/source, and input metadata remain in the backend. A future ingestion use case resolves the source from the ingestion. The old actor/URL/format job payload is replaced without a compatibility adapter; no deployed jobs require it. This change does not create production jobs, purge queues, or activate handlers.

The delivered relationship is a nullable, unique ingestion reference on import-source
metadata with restricted ingestion deletion. Sources start unattached; existing
ingestions retain their original provenance without manufactured source records.
The import-source capability resolves metadata by ingestion ID, even after byte
deletion, while keeping storage references private. This is not a standalone
submission/link operation or a placeholder ingestion-processing use case.

### Storage Interface

Use the reusable `@exposurenexus/backend/object-storage` module, which owns the official AWS S3 SDK and a configured, preprovisioned private bucket. The composing caller creates storage separately and injects it into import sources; neither module reads application environment variables or provisions resources. S3 dependencies remain outside the general backend runtime. No provider-specific adapters or blanket compatibility guarantee are introduced: an S3-compatible server still needs to support the SDK operations used.

Keys are generated internally, independently of original filenames. Write-once is an application convention: there is no replace operation, bucket-versioning requirement, or conditional-write enforcement. An administrator or other holder of write credentials can still alter an object; direct browser uploads must revisit this assumption.

Creation takes a readable stream and declared byte length `sizeBytes`. The feature validates the readable input and declared size against its configurable `maxSizeBytes` limit (100 MiB by default) before transfer. Storage enforces the exact declared byte count while streaming; the feature marks a source available only after that write succeeds and metadata finalization completes. Unknown-length streams, whole-file buffering, and multipart/resumable uploads are outside this foundation.

Reserve complete source metadata and the exact bucket/key reference before writing bytes. The feature safely owns input while reservation is pending, handles input errors during database waits, and destroys it on reservation failure. PostgreSQL and S3 do not share a transaction: caught failures receive best-effort compensation, while incomplete records identify interrupted work. Do not expose an incomplete or mismatched upload as available.

### Reusable Storage Refinement

Tickets 01 and 02 refine the initial feature-local storage decision: reusable
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
`CreateImportSourceCommand`, `ImportSource`, and persisted source metadata use one
`sizeBytes` field: the declared length for incomplete sources, verified when
availability is established. There is no separate expected/actual size pair or
feature-level observed-size bookkeeping. The new source migration is revised in
place, retaining nonnegative safe-integer size constraints and the remaining
availability invariants without a forward migration.

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
contract. This refinement adds no production API/worker composition or startup checks.

### Retention And Deletion

A deployment-wide policy selects `temporary` by default or `keep`. Snapshot the policy on each source so later configuration changes affect new sources only. There is no per-import override initially. `keep` means intended retention, not regulatory locking or protection against explicit deletion.

Deletion explicitly removes object bytes regardless of retention policy. It is repeatable, treats an already-absent object as success, and records deletion only after storage deletion succeeds. Preserve provenance and the first deletion timestamp, including overlapping deletes. If storage deletion succeeds but recording it fails, repeating the operation must complete the bookkeeping rather than require the object to exist again.

The future ingestion handler decides whether and when to invoke deletion using the source's recorded policy and durable processing outcome. This foundation implements neither execution-outcome policy nor automatic cleanup. Merely exiting a handler is not proof that input is no longer needed for retry.

## Considered Alternatives

- **Bytes or presigned download URLs in jobs:** bytes burden broker storage and redelivery; expiring URLs couple input access to queue delay, retries, and credential lifetime. A durable ingestion reference avoids both.
- **Source metadata only on ingestion:** fewer records, but no independent identity or bookkeeping for input received before ingestion acceptance.
- **Bucket versioning or conditional writes:** stronger input stability, deliberately deferred in favor of internally generated keys and a write-once convention.
- **Age-based bucket expiration or scheduled cleanup:** cannot be adopted blindly alongside retained and active sources. The selected scope exposes deletion for the future handler rather than adding a scheduler.
- **Eager application wiring:** would require storage even though there is no production caller. Capability configuration and documentation come first; application wiring accompanies real callers.

## Consequences And Deferred Work

This extends the backend's capabilities and ingestion relationship without changing the connected-idle worker, singleton API relay, or existing dependency-validation rules in [ADR-0005](0005-worker-runtime-and-deployment-topology.md). The import HTTP endpoint remains unavailable. S3 is not a required backend-runtime or application-startup dependency. API and worker production composition, startup checks, and storage lifecycle wiring remain deferred until their real callers exist.

`temporary` is recorded intent, not automatic expiry in this foundation. Crash-abandoned and never-submitted sources may persist until explicitly cleaned up. Ordinary caught failures receive best-effort cleanup, not a guarantee of orphan reclamation. Keeping provenance does not imply keeping bytes, and a self-hosted S3 gateway inherits the durability of its underlying storage rather than AWS S3's availability guarantees.

Browser uploads, HTTP import endpoints, ingestion matching and persistence, production job creation, execution-state orchestration, retry classification, worker activation, source reprocessing, automatic orphan reclamation, and operator cleanup tooling are separate work. Future acceptance must atomically link the ingestion and insert its outbox job, and future execution must establish idempotency before consuming real work. Neither guarantee follows merely from storing the input in S3.
