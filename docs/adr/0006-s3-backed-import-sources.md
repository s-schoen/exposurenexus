# S3-Backed Import Sources

**Status:** Accepted; storage, explicit deletion, and durable-reference foundation implemented. Reusable object storage is also implemented; import-source migration, submission, and processing remain deferred.

Asynchronous ingestion needs input bytes that remain accessible independently of an HTTP request or worker host. Store raw input in private S3 object storage, track each import source in PostgreSQL, and identify an ingestion in its job rather than carrying bytes or an expiring URL. This separates file lifetime from message delivery without introducing the ingestion pipeline itself.

## Decision

### Ownership And Handoff

Add an import-source capability to the shared backend established by [ADR-0004](0004-shared-backend-capabilities.md). Callers use source creation, metadata lookup, streamed reading, and explicit deletion by source ID. The capability owns source persistence and object access; the worker will call it in-process, not through an HTTP endpoint or direct database queries.

An import source has its own identity, provenance, storage reference, and lifecycle metadata. It can exist before ingestion and belong to at most one ingestion. Retries reuse the same ingestion and source; keeping raw input does not introduce reuse across ingestions or a reprocessing feature. Deleting bytes preserves source metadata and the ingestion relationship.

Ingestion job data contains only `ingestionId`. Authoritative actor, scanner format/source, and input metadata remain in the backend. A future ingestion use case resolves the source from the ingestion. The old actor/URL/format job payload is replaced without a compatibility adapter; no deployed jobs require it. This change does not create production jobs, purge queues, or activate handlers.

The delivered relationship is a nullable, unique ingestion reference on import-source
metadata with restricted ingestion deletion. Sources start unattached; existing
ingestions retain their original provenance without manufactured source records.
The import-source capability resolves metadata by ingestion ID, even after byte
deletion, while keeping storage references private. This is not a standalone
submission/link operation or a placeholder ingestion-processing use case.

### Storage Interface

Use the official AWS S3 SDK against a configured, preprovisioned private bucket. The capability accepts configuration rather than reading application environment variables or provisioning resources. The initial feature-local implementation, still used by import sources, keeps S3 dependencies outside the general backend runtime. No provider-specific adapters or blanket compatibility guarantee are introduced: an S3-compatible server still needs to support the SDK operations used.

Keys are generated internally, independently of original filenames. Write-once is an application convention: there is no replace operation, bucket-versioning requirement, or conditional-write enforcement. An administrator or other holder of write credentials can still alter an object; direct browser uploads must revisit this assumption.

Creation takes a readable stream and declared byte length. The default configurable limit is 100 MiB. Check the declared size before transfer, enforce limits and actual byte count while streaming, and mark a source available only after successful storage of exactly the declared bytes. Unknown-length streams, whole-file buffering, and multipart/resumable uploads are outside this foundation.

Create the source record before writing its object. PostgreSQL and S3 do not share a transaction: a caught failure attempts best-effort object cleanup, while incomplete records identify interrupted work. Do not expose an incomplete or mismatched upload as available.

### Reusable Storage Refinement

Ticket 01 deliberately refines the feature-local storage decision: reusable
`@exposurenexus/backend/object-storage` now provides bucket-bound streamed writes,
reads, deletion, and explicit `close()` outside import sources, without database or
runtime dependencies. This lets capabilities share byte storage without adopting
import-source metadata or policy. Its composing caller owns client lifetime; the
module owns exact-length enforcement, backpressure, cancellation, and local
transfer settlement, but never deletes objects to compensate for failed writes.
See [Object Storage](../object-storage.md) for the contract and configuration
continuity requirements.

Import sources have not migrated: they still configure and construct their own
SDK client, implement transfers and compensation, and expose `ImportSources.close()`.
Ticket 02 will inject the storage handle, remove feature-owned SDK/client shutdown,
and add recorded-bucket mismatch checks. Source metadata, key generation, size and
retention policy, finalization, and compensation decisions remain feature-owned.
This refinement does not deliver production API/worker composition or startup checks.

### Retention And Deletion

A deployment-wide policy selects `temporary` by default or `keep`. Snapshot the policy on each source so later configuration changes affect new sources only. There is no per-import override initially. `keep` means intended retention, not regulatory locking or protection against explicit deletion.

Deletion explicitly removes object bytes regardless of retention policy. It is repeatable, treats an already-absent object as success, and records deletion only after storage deletion succeeds. Preserve provenance and the deletion timestamp. If storage deletion succeeds but recording it fails, repeating the operation must complete the bookkeeping rather than require the object to exist again.

The future ingestion handler decides whether and when to invoke deletion using the source's recorded policy and durable processing outcome. This foundation implements neither execution-outcome policy nor automatic cleanup. Merely exiting a handler is not proof that input is no longer needed for retry.

## Considered Alternatives

- **Bytes or presigned download URLs in jobs:** bytes burden broker storage and redelivery; expiring URLs couple input access to queue delay, retries, and credential lifetime. A durable ingestion reference avoids both.
- **Source metadata only on ingestion:** fewer records, but no independent identity or bookkeeping for input received before ingestion acceptance.
- **Bucket versioning or conditional writes:** stronger input stability, deliberately deferred in favor of internally generated keys and a write-once convention.
- **Age-based bucket expiration or scheduled cleanup:** cannot be adopted blindly alongside retained and active sources. The selected scope exposes deletion for the future handler rather than adding a scheduler.
- **Eager application wiring:** would require storage even though there is no production caller. Capability configuration and documentation come first; application wiring accompanies real callers.

## Consequences And Deferred Work

This extends the backend's capabilities and ingestion relationship without changing the connected-idle worker, singleton API relay, or existing dependency-validation rules in [ADR-0005](0005-worker-runtime-and-deployment-topology.md). S3 is not yet a required application-startup dependency. API and worker production composition, startup checks, and storage lifecycle wiring remain deferred until their real callers exist.

`temporary` is recorded intent, not automatic expiry in this foundation. Crash-abandoned and never-submitted sources may persist until explicitly cleaned up. Ordinary caught failures receive best-effort cleanup, not a guarantee of orphan reclamation. Keeping provenance does not imply keeping bytes, and a self-hosted S3 gateway inherits the durability of its underlying storage rather than AWS S3's availability guarantees.

Browser uploads, HTTP import endpoints, ingestion matching and persistence, production job creation, execution-state orchestration, retry classification, worker activation, source reprocessing, automatic orphan reclamation, and operator cleanup tooling are separate work. Future acceptance must atomically link the ingestion and insert its outbox job, and future execution must establish idempotency before consuming real work. Neither guarantee follows merely from storing the input in S3.
