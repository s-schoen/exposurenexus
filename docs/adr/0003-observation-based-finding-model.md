# Observation-Based Finding Model

ExposureNexus will separate human workflow cases from source detection records by
introducing observations under findings. A finding becomes the human-facing case
for a weakness on one asset, observations carry scanner or manual evidence, and
vulnerability catalog entries become optional enrichment instead of finding
identity.

## Context

The current import model treats imported scanner output as findings. That makes
deduplication depend on a single finding fingerprint and forces scanner-provided
data such as evidence, remediation, source, and timestamps onto the finding
itself. This breaks down when multiple scanners detect the same issue, when one
scanner sees the same issue in later scans, or when scanner identifiers do not
map cleanly to a curated vulnerability catalog entry.

We need a model that keeps the finding as the thing users triage, assign, accept,
mitigate, or close, while still preserving repeated and multi-source detections
as separate source reports.

## Decision

Findings are human-facing workflow cases. Observations are scanner or manual
detection events attached to findings. A vulnerability is a reusable catalog
entry that can enrich a finding, but it does not define finding identity.

The finding identity is centered on one asset, a normalized weakness, and a
normalized affected resource. Observations carry source-reported weakness and
affected-resource data. Importers resolve source records to existing assets and
findings, attach observations, and add catalog enrichment only when existing
catalog entries can be matched.

Affected resources are represented as a discriminated union. Every affected
resource has a required `type`, and each type defines its allowed fields and
normalization rules. Findings store canonical affected-resource data suitable for
workflow and matching. Observations use the same type family, but may contain
partial and source-snapshot data that is not copied into the finding.

## Data Structures

The examples below describe the intended domain shape. They are not a final API
or migration specification.

### Weakness

A weakness is the underlying security problem or suspected problem independent of
the vulnerability catalog. Weakness data is structured but does not require a
hard source-specific schema.

Weakness identifiers live under an `identifiers` object. Each key is an
identifier namespace, such as `cve`, `cwe`, `ghsa`, `nuclei`, or `semgrep`, and
each value is an array of identifiers in that namespace. CVEs and CWEs are arrays,
even when there is one value. CWE values use canonical strings such as `CWE-200`.
Identifier namespaces are extensible. Namespace keys are canonical lowercase
strings. Identifier arrays are trimmed, deduplicated, and sorted. Well-known
identifier formats such as CVE, CWE, and GHSA are canonicalized; identifiers in
other namespaces preserve case because source rule identifiers may be
case-sensitive. An empty weakness is represented canonically as
`{"identifiers":{}}`, although inputs may omit `identifiers`.

```json
{
  "identifiers": {
    "cve": ["CVE-2026-34256"],
    "cwe": ["CWE-200"],
    "nuclei": ["admin-panel"]
  }
}
```

For SAST-like data, the weakness may be rule-based without a catalog identifier:

```json
{
  "identifiers": {
    "cwe": ["CWE-89"],
    "semgrep": ["typescript.express.security.sql-injection"]
  }
}
```

### Affected Resource

An affected resource is the specific part of an asset affected by a weakness. It
is represented as a discriminated union with a required `type` property. The
selected type determines which additional properties are valid. Properties from
other types are rejected rather than retained as an arbitrary property bag.

The initial type family is:

```ts
type AffectedResource =
  | AssetAffectedResource
  | UnspecifiedAffectedResource
  | WebEndpointAffectedResource
  | NetworkServiceAffectedResource
  | SourceCodeAffectedResource
  | PackageAffectedResource
  | ContainerImageAffectedResource
  | CloudResourceAffectedResource;
```

The type family is extensible through an explicit schema and domain-model change.
There is no generic `custom` affected-resource type in the initial model.

Affected-resource data may repeat information that also appears on the asset,
such as a host name, repository, cloud account, or image repository. This is
acceptable because the asset identifies the owning inventory object while the
affected resource identifies the part of that asset involved in the finding.

#### Unspecified Resources

`unspecified` means that the affected subresource is not known or has not yet been
recorded:

```json
{
  "type": "unspecified"
}
```

These values are not equivalent. `asset` is an affirmative identity statement;
`unspecified` is the absence of narrower resource identity. Neither type accepts
additional fields.

Manual workflows may use `unspecified`. Automated imports may not use
`unspecified` to resolve or create findings.

#### Web Endpoint Resource

`webEndpoint` represents an HTTP-like endpoint. Canonical finding data uses
parsed fields as the authoritative representation rather than storing a second,
potentially conflicting URL string.

```json
{
  "type": "webEndpoint",
  "scheme": "https",
  "host": "example.com",
  "port": 443,
  "path": "/admin"
}
```

A vulnerability may be specific to an HTTP method or one component of the
request or response:

```json
{
  "type": "webEndpoint",
  "scheme": "https",
  "host": "example.com",
  "port": 443,
  "path": "/users",
  "method": "GET",
  "component": {
    "kind": "queryParameter",
    "name": "id"
  }
}
```

Supported initial component kinds are `endpoint`, `queryParameter`,
`pathParameter`, `header`, `cookie`, `bodyField`, and `response`. `name` is
required for `queryParameter`, `pathParameter`, `header`, `cookie`, and
`bodyField`. `name` is not allowed for `endpoint` or `response`.

An observation may additionally preserve the URL exactly as reported by its
source:

```json
{
  "type": "webEndpoint",
  "reportedUrl": "https://EXAMPLE.com:443/admin",
  "scheme": "https",
  "host": "example.com",
  "port": 443,
  "path": "/admin"
}
```

`reportedUrl` is observation-only source context. It is not authoritative finding
identity and is not copied into the finding.

#### Network Service Resource

`networkService` represents a listening service that is not modeled as a web
endpoint.

```json
{
  "type": "networkService",
  "host": "db.example.com",
  "port": 5432,
  "transport": "tcp",
  "protocol": "postgresql"
}
```

`transport` is initially `tcp` or `udp`. `protocol` is an optional normalized
application-protocol name.

Supplied ports are integers from 1 through 65535. Web endpoint schemes are
initially `http` or `https`; methods use normalized uppercase HTTP tokens.
Ecosystem, provider, and normalized protocol values use lowercase canonical
strings but remain extensible vocabularies.

#### Source Code Resource

`sourceCode` represents a source-code location. Repository and file identify the
broad resource. A symbol, location, or stable location fingerprint may identify a
more specific occurrence.

```json
{
  "type": "sourceCode",
  "repository": "https://github.com/org/repo",
  "file": "src/data.ts",
  "location": {
    "startLine": 434,
    "startColumn": 12,
    "endLine": 434,
    "endColumn": 31
  },
  "symbol": "loadCustomerData",
  "locationFingerprint": "sha256:9dd7b2..."
}
```

Line and column numbers are one-based in the ExposureNexus domain model.
Importers convert source-specific indexing conventions before persistence.
`file` is repository-relative and uses `/` as the path separator.

When `location` is present, `startLine` is required. `startColumn`, `endLine`,
and `endColumn` may only appear with their preceding coordinates. All location
values are positive integers, and an end position may not precede the start.

An observation may additionally identify the source snapshot:

```json
{
  "type": "sourceCode",
  "repository": "https://github.com/org/repo",
  "file": "src/data.ts",
  "revision": "d6c3b851dcfe4ed170927c63d45f301761172c6f",
  "location": {
    "startLine": 434,
    "startColumn": 12
  },
  "symbol": "loadCustomerData",
  "locationFingerprint": "sha256:9dd7b2..."
}
```

`revision` is observation-only source-snapshot context. It is not copied into the
finding. A finding may retain a location as a user-facing locator, but importers
do not overwrite an existing location merely because later code changes move the
same occurrence.

#### Package Resource

`package` represents an installed or declared software package.

```json
{
  "type": "package",
  "ecosystem": "npm",
  "name": "express",
  "installationPath": "package-lock.json"
}
```

An observation may additionally preserve the package version reported by its
source:

```json
{
  "type": "package",
  "ecosystem": "npm",
  "name": "express",
  "version": "4.21.2",
  "installationPath": "package-lock.json"
}
```

`version` is observation-only source-snapshot context. It is not copied into the
finding.

#### Container Image Resource

`containerImage` represents a container image or image repository when the
weakness applies to the image as a resource rather than to one package inside it.

```json
{
  "type": "containerImage",
  "registry": "registry.example.com",
  "repository": "payments/backend",
  "digest": "sha256:abcd..."
}
```

An observation may also report the mutable tag seen by the source:

```json
{
  "type": "containerImage",
  "registry": "registry.example.com",
  "repository": "payments/backend",
  "tag": "latest"
}
```

`tag` is observation-only source-snapshot context. It is not copied into the
finding.

#### Cloud Resource

`cloudResource` represents a provider-native cloud or infrastructure resource.
Stable provider resource identifiers are preferred over display names.

```json
{
  "type": "cloudResource",
  "provider": "aws",
  "providerAccount": "123456789012",
  "region": "eu-central-1",
  "resourceId": "arn:aws:s3:::example-bucket"
}
```

An optional `subresource` may identify a narrower provider-native component.
An observation may include a source-reported `displayName`. `displayName` is
observation-only context, is not canonical identity, and is not copied into the
finding.

#### Finding And Observation Projections

Findings and observations use the same affected-resource type family with
different validation projections:

- A finding contains canonical, normalized resource data suitable for workflow
  and matching.
- Observation-only fields preserve what the source saw. They are not copied into
  the finding through automatic enrichment.
- A concrete `type` is part of affected-resource identity. Automatic enrichment
  may add missing fields only within the same concrete type.
- `unspecified` may be replaced with a concrete type only through an explicit,
  authoritative user action such as correction or manual attachment. It is not
  automatically specialized as a side effect of scanner matching.

A disagreement between concrete types is an identity conflict. Whether an
observation may still attach is decided by the observation-to-finding matching
policy and must be logged when attachment proceeds.

#### Normalization

Affected-resource normalization is type-specific and versioned. Importers
normalize source data before using it for finding matching or initializing a
finding.

For `webEndpoint` and `networkService` resources:

- DNS names are lowercased, IDNA-normalized, and stored without a trailing dot.
- IP addresses use a canonical textual representation.
- Schemes, transports, methods, and normalized protocol names use a consistent
  case.
- For HTTP and HTTPS endpoints, default ports are materialized as `80` and `443`.
- Web paths resolve dot segments, default to `/`, and preserve path case.
- URL fragments do not participate in resource identity.
- Arbitrary query values do not participate in resource identity. A
  parameter-specific issue identifies the parameter through `component`.

For `sourceCode` resources:

- Repository identifiers use the same product-owned canonical `server/path`
  representation as asset VCS repository identifiers. Equivalent HTTP, HTTPS,
  SSH, SCP, trailing `.git`, and trailing-slash forms normalize to that value.
- Equivalent repository URL forms are normalized consistently, including an
  optional trailing `.git` suffix and trailing slash.
- File paths are repository-relative, use `/`, and may not escape the repository
  root.
- Source-provided or importer-derived location fingerprints are stored with a
  namespace or algorithm prefix.

For `package` resources:

- Ecosystem names use a canonical lowercase value.
- Package names use an extensible normalizer registry. Registered ecosystems
  apply ecosystem-specific rules; otherwise names are trimmed and preserve case.
  The initial registry includes npm.
- Installation paths use the same normalized path conventions as the owning
  asset type.

For `containerImage` and `cloudResource` resources:

- Registry names and provider names use canonical lowercase values where their
  external identity rules are case-insensitive.
- Image digests retain their algorithm prefix.
- Provider-native resource identifiers are preserved according to provider
  canonicalization rules rather than normalized as display text.

Changing normalization behavior requires a versioned migration or rematching
strategy because it can change finding identity and matching outcomes.
Normalization implementations declare an application normalization version.
The initial model does not persist a normalization version on each finding or
observation.

#### Validation

Every affected resource must contain `type`. Empty affected-resource objects are
not valid.

Validation is contextual:

- Manual findings and manual observations may use `asset`, `unspecified`, or a
  partially populated concrete type.
- Automated observations must use `asset` or a concrete type and must contain
  enough type-specific identity data for matching.
- Findings created by an automated importer must contain `asset` or a normalized
  concrete type with sufficient identity.
- Unknown types and fields that do not belong to the selected type are rejected.
- Observation-only source-snapshot fields are rejected on canonical finding
  resources.

The exact minimum field sets used for automated matching are part of the
observation-to-finding matching policy and are not decided in this ADR.

### Finding

A finding is the human-facing workflow case. It belongs to exactly one asset and
may link to zero or more vulnerability catalog entries through a mapping table.
It owns the normalized weakness and affected-resource identity used for workflow
and matching.

```json
{
  "id": "finding-uuid",
  "assetId": "asset-uuid",
  "title": "Exposed admin panel",
  "severity": "high",
  "status": "active",
  "assigneeId": null,
  "dueDate": null,
  "mitigation": "Restrict access to the admin route or require authentication.",
  "weakness": {
    "identifiers": {
      "cwe": ["CWE-200"],
      "nuclei": ["admin-panel"]
    }
  },
  "affectedResource": {
    "type": "webEndpoint",
    "scheme": "https",
    "host": "example.com",
    "port": 443,
    "path": "/admin"
  }
}
```

Finding title and severity are required. They are initialized from the best
available source, then owned by the finding. Later observations or catalog
changes do not automatically rewrite them.

`firstSeen` and `lastSeen` are not stored finding lifecycle state. They are API
summary fields derived from attached observation `observedAt` timestamps.

Finding responses may include observation-derived summaries:

```json
{
  "observationCount": 4,
  "observingSources": ["manual", "nuclei"],
  "firstSeen": "2026-06-01T10:15:00.000Z",
  "lastSeen": "2026-06-20T08:30:00.000Z"
}
```

For a finding without observations, `observationCount` is `0`,
`observingSources` is empty, and `firstSeen` and `lastSeen` are `null`.
`observingSources` are returned in lexical order.

Findings do not own source evidence and do not get a separate description or
notes field in the initial model. Source explanations belong to observations;
human handling guidance belongs to finding mitigation.

### Observation

An observation is a source detection event or manual detection record. It
attaches to exactly one finding and inherits its canonical asset through that
finding. It does not link directly to vulnerability catalog entries.

```json
{
  "id": "observation-uuid",
  "findingId": "finding-uuid",
  "ingestionId": "ingestion-uuid",
  "source": "nuclei",
  "title": "Admin panel exposure",
  "description": "A publicly reachable admin panel was detected.",
  "severity": "high",
  "evidence": "GET /admin returned a login form and status 200.",
  "remediation": "Restrict access to trusted users or networks.",
  "weakness": {
    "identifiers": {
      "cwe": ["CWE-200"],
      "nuclei": ["admin-panel"]
    }
  },
  "affectedResource": {
    "type": "webEndpoint",
    "reportedUrl": "https://example.com/admin",
    "scheme": "https",
    "host": "example.com",
    "port": 443,
    "path": "/admin"
  },
  "observedAt": "2026-06-20T08:30:00.000Z",
  "createdAt": "2026-06-20T08:35:00.000Z",
  "updatedAt": "2026-06-20T08:35:00.000Z",
  "createdBy": "user-profile-uuid",
  "updatedBy": "user-profile-uuid"
}
```

Observation fields:

- `source` is the scanner or reporting family, such as `nuclei`, `semgrep`,
  `trivy`, or `manual`; configured source instances are out of scope for now.
- `ingestionId` is set for imported observations and absent or null for manual
  observations.
- `title` is required. If a source has no explicit title, its importer derives a
  meaningful title from source data such as a CVE name, advisory label, or rule.
- `description`, `evidence`, and `remediation` are optional source-provided
  context.
- `severity` is required and falls back to `info` when the source provides no
  stronger severity.
- `weakness` is a required structured field and may be partial. A manual
  observation may use an empty weakness object when the user explicitly attaches
  it to a finding.
- `affectedResource` is required, must contain `type`, and may be partial. Manual
  observations may use `{"type":"unspecified"}` when the user explicitly
  attaches them to a finding. Automated imports may not use `unspecified` or
  otherwise insufficient resource identity for matching.
- `observedAt` is the source detection time and may be edited.
- `createdAt` is the ExposureNexus record creation time and is system-owned.
- `updatedAt` is the ExposureNexus record update time and is system-owned.
- `createdBy` and `updatedBy` are user profile IDs.

Observation title, description, evidence, remediation, severity, weakness,
affected resource, and observed time may be edited. Source, ingestion, creation
time, and creation actor are immutable. Moving an observation changes its parent
finding through an explicit move operation rather than an ordinary content edit.

The initial observation source enum is `manual` and `nuclei`. The enum is a
closed validation set; extending it is an explicit domain model change.

Observations are editable so users can correct importer mistakes, source
interpretation errors, or manual observation content. ExposureNexus does not
preserve a separate raw source payload in this initial model.

Creating, editing, moving, or deleting an observation updates its parent
finding's `updatedAt` and `updatedBy` fields because the finding's supporting
information changed. Moving an observation updates both the previous and new
parent findings.

Observations do not have their own lifecycle status. If an observation is wrong,
users edit, move, or delete it. Finding status remains the lifecycle state.

### Vulnerability Catalog Entry

A vulnerability is a reusable catalog entry. It may represent a CVE, CWE,
advisory, or manually curated reusable weakness.

```json
{
  "id": "vulnerability-uuid",
  "type": "cve",
  "identifier": "CVE-2026-34256",
  "title": "Example Product Remote Code Execution",
  "description": "A remote code execution weakness in Example Product.",
  "severity": "critical",
  "metadata": {
    "cvss": 9.8,
    "publishedAt": "2026-02-01"
  }
}
```

`type + identifier` is the catalog identity and must be unique. Manually curated
entries use the same identity model:

```json
{
  "id": "vulnerability-uuid",
  "type": "custom",
  "identifier": "exposed-admin-panel",
  "title": "Exposed Admin Panel",
  "description": "An administrative interface is reachable by unauthorized users.",
  "severity": "high"
}
```

The initial vulnerability type enum is `cve`, `cwe`, `ghsa`, `advisory`, and
`custom`. The enum is a closed validation set; extending it is an explicit domain
model change.

Catalog metadata is an optional JSON object without a type-specific schema in
the initial model. Authorized users may correct a catalog entry's type and
identifier while its internal ID and finding links remain stable. Corrected
identities remain subject to the unique `type + identifier` constraint.

Vulnerability severity is required and falls back to `info` when no stronger
catalog severity is available.

### Finding To Vulnerability Links

Findings link to vulnerability catalog entries through a many-to-many association.
Linked vulnerabilities are equal enrichment links; there is no primary
vulnerability that drives finding title, severity, display, or identity.

```json
{
  "findingId": "finding-uuid",
  "vulnerabilityId": "vulnerability-uuid"
}
```

Deleting a vulnerability catalog entry removes its catalog links from findings.
Finding workflow cases remain.

### Ingestion

An ingestion groups observations created from one imported source file or source
dataset. Manual observations do not belong to ingestions.

```json
{
  "id": "ingestion-uuid",
  "source": "nuclei",
  "createdAt": "2026-06-20T08:35:00.000Z",
  "createdBy": "user-profile-uuid",
  "scope": {
    "target": "example.com"
  },
  "summary": {
    "processed": 120,
    "createdObservations": 80,
    "skipped": 5,
    "errors": 0
  }
}
```

Ingestions are backend grouping and summary records for now. User-facing ingestion
history or detail workflows are out of scope.

Skipped source records are logged server-side and counted in the summary, but
they are not stored as observations or separate database records.

### Vulnerability Source Mapping

Vulnerability source mappings map source-reported weakness data to catalog
entries for enrichment. They do not define finding identity.

```json
{
  "id": "mapping-uuid",
  "weakness": {
    "identifiers": {
      "nuclei": ["admin-panel"]
    }
  },
  "vulnerabilityId": "vulnerability-uuid"
}
```

A mapping weakness must contain at least one identifier. A separate source field
is not stored because source-specific namespace keys such as `nuclei` and
`semgrep` identify source rule families. The same canonical weakness may map to
multiple catalog entries, but the same canonical weakness-to-vulnerability pair
is unique.

Exact catalog identifiers such as CVEs may link directly by catalog identity.
Scanner rules or other source-specific weakness data may require mappings because
the relationship to catalog entries can be heuristic or source-specific. A
source-specific weakness may map to multiple catalog entries; conceptually this
is many-to-many, represented as one mapping row per source-to-catalog-entry link.

The matching semantics for source mappings are intentionally not decided in this
ADR.

## Process Changes

### Manual Finding Creation

Manual finding creation creates both a finding and a manual observation. The user
chooses the asset and workflow fields such as title, severity, status, assignee,
due date, and optional mitigation. Weakness identity may start as an empty object.
Affected-resource identity must always contain a type. It may start as
`{"type":"unspecified"}` when no narrower resource is known.

The initial manual observation may default its title, severity, weakness, and
affected resource from the finding and its observed time from creation time.
Adding a later manual observation may use the same defaults from its existing
parent finding.

When the user supplies a concrete affected resource, the manual finding and
observation use the appropriate typed variant. Partial concrete resources are
permitted in manual workflows.

The manual observation stores user-provided source context such as evidence,
description, observed time, optional remediation, and any source-snapshot
resource fields. The user decision to create or attach the observation is enough
resolution authority; automated fingerprint matching is not required for manual
observations.

Attaching or moving a manual observation under an existing finding does not
implicitly enrich or replace the finding's canonical weakness or affected
resource. Users correct those finding-owned fields explicitly.

### Scanner Import

Imports ingest external observations, not findings directly.

For each source record, the importer:

1. Parses source-specific data into an observation shape.
2. Derives required observation fields such as title, severity, weakness,
   affected-resource type and fields, source, and observed time.
3. Normalizes affected-resource fields according to their type while preserving
   source-snapshot fields on the observation.
4. Resolves the record to an existing asset by asset name.
5. Resolves the observation to an existing finding or creates a new finding when
   the asset match is confident and the weakness/resource identity is sufficient.
6. Attaches the observation to the finding.
7. Adds missing weakness or canonical affected-resource fields to the finding
   only when the update is additive, non-overwriting, and within the same concrete
   affected-resource type.
8. Adds exact-match catalog enrichment links to the finding when existing catalog
   entries match identifiers from the observation weakness.

Automated importers do not create findings with `affectedResource.type` set to
`unspecified`.

Imports do not create assets. Records that cannot be confidently matched to an
existing asset are skipped and logged server-side. Imports do not create
vulnerability catalog entries.

Ingestions may partially succeed. Skipped records do not block successfully
resolved observations from being imported.

For JSONL imports, each nonblank record line counts as processed. A valid record
that cannot be resolved or lacks sufficient identity counts as skipped. A
malformed record or a record that fails processing counts as an error. Only a
committed observation increments `createdObservations`. An ingestion remains a
valid grouping record when all of its source records are skipped or erroneous.

### Attaching Observations To Existing Findings

When a new observation attaches to an existing finding, it may enrich the finding
with missing weakness identifiers or canonical affected-resource fields. This
enrichment is additive only. Existing finding identity fields are not removed or
overwritten by new observations.

Affected-resource enrichment may add fields only when the observation and finding
use the same concrete type. A concrete finding type is not automatically changed
or combined with fields from another type. Specializing `unspecified` to a
concrete type requires an explicit, authoritative user action.

If observation identity data conflicts with the finding's normalized identity,
including a disagreement in concrete affected-resource type, the observation may
still attach when matching is confident. The conflict is a diagnostic condition
to log during import, not user-facing workflow state in the initial model.

Observation presence does not automatically change finding title, severity,
status, assignee, due date, or mitigation.

### Catalog Enrichment

Observation weakness identifiers may add finding-to-vulnerability links when they
exactly match existing catalog entries. For example, `CVE-2026-34256` can link to
a vulnerability with `type: "cve"` and `identifier: "CVE-2026-34256"`.

Exact CVE, CWE, GHSA, advisory, and similar identifiers may all enrich findings.
Broad identifiers such as CWE are enrichment only and do not define finding
identity.

Automatic catalog linking is additive only. Imports do not remove existing
catalog links. Removing or changing catalog links is an explicit catalog-link
correction workflow.

Explicitly adding or removing a catalog link updates the finding's `updatedAt`
and `updatedBy` fields. Editing the linked catalog entry does not update audit
fields on every linked finding.

### Observation Correction

Users may edit observations to correct importer issues or manual mistakes. Users
may move an observation from one finding to another when matching was wrong. Users
may delete an observation directly; this removes one supporting source report but
does not automatically delete, close, or otherwise change the finding.

Users may also correct the affected-resource type or type-specific fields. A type
change is a replacement of resource identity, not additive enrichment, and must
be performed through an explicit correction workflow.

Finding and observation update requests may be partial at the top level. When a
request supplies `weakness` or `affectedResource`, it replaces that complete JSON
value. User correction requests do not deep-merge identity-bearing JSON.

An observation attaches to exactly one finding. If a source record describes
multiple workflow cases, the importer or user workflow should split it into
multiple observations before attachment.

### Finding Deletion And Empty Findings

Observations cannot stand alone. Deleting a finding deletes its attached
observations. To preserve an observation, move it to another finding before
deleting the original finding.

A finding may remain after all supporting observations have been moved away or
deleted. Empty findings are still workflow cases and are not automatically
deleted, closed, or marked duplicate.

Deleting an asset remains blocked while any finding references that asset.

### Lifecycle And Status

Finding status remains human workflow state. Observation presence or absence may
inform future suggestions, but imports do not automatically close or reopen
findings without an explicit lifecycle policy.

Ingestions make future lifecycle reasoning possible by recording comparable
source ingestions. A missing observation only has lifecycle meaning when it is
missing from a comparable ingestion that covered the same relevant scope. No
automation is included in this ADR.

The `duplicate` finding status remains, but its meaning narrows to human cleanup:
a finding was created separately and later determined to represent the same
workflow case as another finding. Normal scanner deduplication attaches
observations to the existing finding instead of creating duplicate findings.

### UI And Permissions

The primary UI remains finding-centric. Observations are supporting detail shown
through their parent finding. Standalone observation navigation, listing, and
triage workflows are out of scope for the initial model.

Triage and dashboard counts remain finding-based for now. Observation and source
analytics are out of scope.

Observation access is governed by finding permissions:

- `finding:read` allows reading observations attached to readable findings.
- `finding:write` allows creating, editing, and moving observations attached to
  findings.
- `finding:delete` allows deleting observations or deleting findings with their
  observations.

## Initial Implementation Contract

The first implementation is a synchronized breaking cutover across shared types,
database schema, API, events, and UI. ExposureNexus is still a `0.x` release, and
the implementation assumes an empty database. A destructive forward migration
may replace the old finding and vulnerability structures without compatibility
columns or data backfills. Old API fields, event projections, and UI behavior are
not retained as aliases.

### Persistence

Weakness and affected-resource values are stored as validated PostgreSQL `jsonb`.
The application validates these cohesive values through the shared strict
schemas before persistence and after reads. Observations, ingestions,
finding-to-vulnerability links, and vulnerability source mappings remain
relational entities rather than being embedded in finding JSON.

Vulnerability metadata and ingestion scope are JSON objects stored as `jsonb`.
Ingestion summary values are nonnegative integer columns named `processed`,
`createdObservations`, `skipped`, and `errors`; API projections group them under
`summary`.

Catalog type and observation source follow the existing type pattern: closed
TypeScript and Zod enums backed by PostgreSQL enum columns. Extending either enum
requires an explicit model and schema migration. Affected-resource discriminants
are closed Zod enums inside their JSON values.

Observation `createdBy` and `updatedBy`, and ingestion `createdBy`, are required
user-profile references whose deletion is restricted. An observation's finding
deletes it through a cascading foreign key. Its optional ingestion reference
restricts ingestion deletion. Ingestions have no deletion workflow in the
initial implementation.

### Finding API

Finding list and detail responses use one projection. In addition to
finding-owned fields, it always includes:

```json
{
  "vulnerabilities": [],
  "observationCount": 0,
  "observingSources": [],
  "firstSeen": null,
  "lastSeen": null
}
```

Linked vulnerabilities are embedded as complete catalog entries and ordered by
type and identifier. Observation sources are ordered lexically. Summary dates
are nullable so empty findings remain representable.

Finding update requests are partial and require at least one mutable field. A
supplied weakness or affected resource replaces that complete JSON value rather
than being deep-merged. Users may replace the affected-resource type through
this explicit update path.

Manual finding creation is one atomic request with finding fields at the top
level and an optional nested `observation` object. Finding title, severity,
weakness, and affected resource are required; the UI initializes empty weakness
and `unspecified` resource values. Omitted initial observation title, severity,
weakness, affected resource, and observed time default from the finding and
creation time. Source is fixed to `manual`, ingestion is null, and optional
initial vulnerability IDs create enrichment links.

Explicit catalog link correction uses:

- `PUT /api/findings/:findingId/vulnerabilities/:vulnerabilityId` to add a link.
- `DELETE /api/findings/:findingId/vulnerabilities/:vulnerabilityId` to remove a
  link.

Both operations require `finding:write`, update the finding audit actor and time,
and return the refreshed finding. The `PUT` is retry-safe: it returns `201` when
it creates the link and `200` when the link already exists. The old
source-and-vulnerability reclassification API is removed.

### Observation API

Observation operations remain under their parent finding:

- `GET /api/findings/:findingId/observations`
- `POST /api/findings/:findingId/observations`
- `PUT /api/findings/:findingId/observations/:observationId`
- `DELETE /api/findings/:findingId/observations/:observationId`
- `POST /api/findings/:findingId/observations/:observationId/move`

The move action accepts a target finding ID. Observations are ordered by
`observedAt` descending and then ID. The initial collection is not paginated.

Observation updates are partial and require at least one mutable field. Title,
description, evidence, remediation, severity, weakness, affected resource, and
observed time are mutable. Source, ingestion, creation actor, and creation time
are immutable. Finding ID changes only through the move action. A supplied
weakness or affected resource replaces that complete JSON value.

Additional manual observations may default omitted title, severity, weakness,
affected resource, and observed time from the parent finding and current time.
Creating or moving them does not implicitly enrich the parent's canonical
weakness or affected resource.

### Transactions And Events

Manual finding creation inserts the finding, initial observation, and optional
catalog links in one transaction. A future automated import processes each
source record in one transaction covering any finding creation, additive
enrichment, catalog links, and observation creation. Events are emitted only
after commit.

Observation mutations emit `observation.created`, `observation.updated`,
`observation.moved`, or `observation.deleted` with complete entity snapshots.
They also emit `finding.updated` for each parent whose audit fields changed.
Moving an observation updates and emits events for both old and new parents.
Catalog link and unlink actions have explicit events. Audit logging redacts
evidence recursively. No raw source file payload is stored or emitted.

Parent-driven database cascades do not emit one child event per deleted row.
Deleting a finding emits the finding deletion event but no event for every
cascaded observation or catalog link. Deleting a vulnerability similarly does
not emit one unlink event per cascaded finding link.

### Import Boundary

Automated persistence is not enabled until the observation-to-finding matching
policy is decided. The import page remains visible but clearly marked as work in
progress and does not submit imports. `POST /api/findings/import` returns `501 Not
Implemented` during this phase.

The model cutover still introduces and tests a source-independent resolver
contract. It accepts an asset ID and normalized observation draft and returns one
of three explicit outcomes: attach to a specified finding, create a finding from
specified canonical fields, or skip with a structured reason. Tests may stub
these outcomes without defining production matching rules.

The initial pure Nuclei translator supports HTTP and HTTPS records. It produces
normalized observation drafts, derives a missing title from the template ID,
falls back missing or unknown severity to `info`, falls back missing observed time
to a supplied ingestion time, adds template/CVE/CWE weakness identifiers,
preserves request/response/cURL evidence, and stores the source URL as
`reportedUrl` while parsing canonical endpoint fields. Other Nuclei protocol
families return a typed unsupported result rather than an assumed resource type.

The ingestion persistence model is included even though automated persistence is
disabled. Once enabled, synchronous imports return ingestion ID and finalized
summary with HTTP 200, including partial successes. Unsupported source and
file-level failures are rejected before ingestion creation. An all-skipped or
all-error dataset still leaves its ingestion grouping record.

Vulnerability source mappings are represented in persistence, but the old raw
mapping API and UI are removed. No source mapping is applied during import until
its matching semantics are decided.

### Initial UI

The finding table uses finding title, retains a compact observing-sources column,
removes source grouping, and defaults to `updatedAt` descending. Finding detail
shows canonical weakness, a type-aware affected-resource view, zero or more
equal catalog links, finding mitigation, derived summaries, and nested
observations.

Manual finding creation and finding/observation correction provide type-aware
controls for every initial affected-resource variant. Observation-only fields
are not exposed as canonical finding fields. The vulnerability UI uses catalog
type and identifier and no longer implies that catalog severity controls finding
severity.

Source analytics and the dashboard source card are removed. Finding-based
status, severity, asset, triage, and mitigation statistics remain. Standalone
observation and ingestion navigation, source-mapping UI, reclassification UI,
and ingestion history remain out of scope.

## Rationale

Separating observations from findings prevents repeated scanner results from
turning into repeated workflow cases. It also allows multiple scanners to support
the same finding without forcing one scanner's evidence, source, or remediation
to overwrite another scanner's data.

Keeping vulnerability catalog entries as enrichment avoids polluting the catalog
with scanner-template artifacts and allows findings to exist for SAST, DAST,
container, or manual weaknesses that do not map cleanly to CVEs. The catalog can
still support filtering and grouping through many-to-many finding links.

Keeping title, severity, status, assignee, due date, and mitigation on the
finding preserves human workflow ownership. Scanner data can initialize a new
finding, but it should not silently rewrite a user's triage or handling decisions
after creation.

Representing affected resources as a discriminated union gives each resource type
explicit validation, normalization, and display semantics while preserving a
single `affectedResource` field across findings and observations. It prevents
invalid combinations such as source-code line numbers on network services and
makes new resource types an intentional domain-model change.

Separating canonical finding fields from observation-only source-snapshot fields
prevents mutable values such as Git
revisions, package versions, image tags, and reported URL strings from silently
changing long-lived finding identity.

Requiring imports to match existing assets avoids hidden asset creation and keeps
asset identity as the stable anchor for finding workflow. Asset aliases and
identifier registries may be useful later, but using asset name keeps this change
smaller.

Using additive-only enrichment avoids accidental data loss. Observations can add
missing context to finding weakness, canonical affected resource, or catalog
links, but conflicts and affected-resource type changes require explicit
correction instead of silent overwrites.

## Consequences

This is a core domain model migration, not an importer-only change. The current
code assumes findings have a required `vulnerabilityId`, a single `source`,
finding-owned `evidence`, stored `firstSeen` and `lastSeen`, and exact
fingerprint-based deduplication. Those assumptions will need to change when this
ADR is implemented.

Affected-resource storage, validation, serialization, import normalization,
matching, and UI rendering must become type-aware. Existing `category: "web"`
resources migrate to `type: "webEndpoint"`; existing `category: "code"`
resources migrate to `type: "sourceCode"`; and empty affected-resource objects
migrate to `type: "unspecified"` unless existing data establishes deliberate
whole-asset scope.

Existing URL strings must be parsed into canonical web-endpoint fields where
possible. Source-reported URL strings belong on observations as `reportedUrl`.
Existing source-code `line` values migrate to `location.startLine` using the
one-based domain convention.

The finding table, observation table, finding API responses, import flow, manual
finding creation, vulnerability catalog model, source mapping model, and finding
UI will all need to reflect the new boundaries.

The initial UI scope stays intentionally small. Users should still primarily work
with findings. Observations add supporting context and correction workflows, but
not a parallel triage surface.

## Decisions Still Open

The following decisions are intentionally deferred:

- Observation-to-finding matching algorithm and confidence model.
- The exact minimum and identity-bearing fields for automated matching within
  each affected-resource type.
- Whether a separate fingerprint envelope exists or whether matching uses
  `assetId`, `weakness`, and normalized `affectedResource` fields directly.
- Vulnerability source mapping matching semantics.
