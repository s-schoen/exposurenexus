# ExposureNexus Context

ExposureNexus is an open-source continuous threat exposure management (CTEM)
platform. It collects observations from manual entry and external scanners,
organizes them into findings on assets, and gives users workflows for triage,
mitigation tracking, asset metadata, and access control.

Exposure is the product and category framing. Keep the core domain terms below
precise: a vulnerability is a catalog item, a finding is a human-facing case,
an observation is a source detection record, and an asset is the managed thing
being affected.

Use this file as the domain glossary for issues, PRDs, refactors, tests, and
agent work. Prefer these terms over close synonyms.

## Core Domain

### Asset

An **asset** is one user-managed thing that is relevant for vulnerability
tracking, such as a host, custom-developed software codebase, container image,
or cloud resource. Assets are the things affected by findings.

An asset has an immutable internal ID that remains distinct from its external
identifiers. An asset may exist without any external identifiers.

### Asset Display Name

An **asset display name** is the required human-readable label for an asset.
Display names need not be unique and must not be treated as asset identity.

Use **display name** for presentation and **asset identifier** for external
identity. Avoid using **name** when it is unclear which concept is intended.

### Asset Type

An **asset type** is the broad classification of an asset. Current types are
`host`, `software`, `containerImage`, and `cloudResource`.

Type values are labels and do not restrict which identifier types an asset may
have. A `software` asset may represent a custom-developed codebase identified by
a VCS repository. A `containerImage` asset represents the image itself, not a
tag, digest, version, or platform variant.

### Asset Identifier

An **asset identifier** is a typed, canonical external identity associated with
one asset. An asset may have any number of identifiers, including multiple
identifiers of the same type; identifiers form an unordered set with no primary
member.

Current identifier types are `dnsName`, `ipAddress`, `vcsRepository`,
`ociImageName`, and `cloudResourceId`. Generic software names and endpoint
details such as ports and paths are not asset identifiers. The same identifier
type, namespace, and canonical value cannot identify more than one asset,
including archived assets.

### Asset Identifier Namespace

An **asset identifier namespace** is an optional identity scope used when an
identifier is not globally unambiguous, such as split DNS or overlapping private
networks. A missing namespace means global scope; namespaces are case-sensitive.

Use namespace only for identity scope. Do not use it for import source,
provenance, ownership, or arbitrary categorization.

### Asset Environment

An **asset environment** is the single operational environment assigned to an
asset. Values are `development`, `staging`, `production`, `unknown`, and
`notApplicable`.

Use `unknown` when the environment has not been established. Use
`notApplicable` only when environment does not meaningfully apply to the asset.

### Asset Lifecycle State

An **asset lifecycle state** is the current inventory classification of an
asset. Values are `active` and `archived`.

Archiving is reversible and does not currently hide, disable, or otherwise
change the behavior of an asset. Archived assets retain their identifiers and
historical findings. Hard deletion is reserved for erroneous assets without
referencing findings.

Every asset records `createdAt`, `updatedAt`, `createdBy`, and `updatedBy`.
Creation and edits require an authenticated user profile explicitly; creation
defaults environment to `unknown` and lifecycle state to `active`. Audit actor
references are required user-profile links whose deletion is restricted.

### Asset Owner

An **asset owner** is the single user profile responsible for handling findings
on an asset.

Assets may have no known owner. Avoid using owner as free text; asset ownership
refers to a link to a user profile. Asset ownership is distinct from finding
assignment: the asset owner is not necessarily the assignee for a specific
finding. A disabled user profile can remain an asset owner. If an asset owner
user profile is deleted, their assets become ownerless. Changing asset ownership
is treated as editing asset metadata. Asset ownership can be set when an asset
is created or changed later. Ownership can be cleared explicitly. When set, the
owner must reference an existing user profile, including disabled user profiles.
Asset responses expose the owner as an owner user profile ID; clients resolve
user profile display data separately when needed. Owner identity is part of the
base asset representation.

### Vulnerability

A **vulnerability** is a reusable catalog entry that enriches findings. It may
represent a CVE, CWE, advisory, or manually curated reusable weakness. Its
catalog identity is the combination of its type and identifier.

Use **vulnerability** for the catalog item, not for a human workflow case or a
source detection record. A finding may link to zero or more vulnerabilities;
catalog links do not define finding identity, title, severity, or lifecycle.

### Weakness

A **weakness** is the underlying security problem or suspected problem,
independent of the vulnerability catalog. A weakness may contain identifiers
grouped by namespace, such as CVE, CWE, scanner rule, or advisory identifiers,
and does not require a catalog match.

Findings own normalized weakness data used for workflow and matching.
Observations preserve the weakness data reported by their source.

### Affected Resource

An **affected resource** is a specific part of an asset affected by a weakness,
or an explicit record that no narrower resource is known. It has a type whose
schema defines its allowed fields. The owning `assetId` already identifies the
asset; `unspecified` represents the absence of narrower resource identity.

Findings own structured affected-resource data. Shared schemas validate field
shape but do not normalize values or enforce semantic relationships.
Observations may additionally preserve source-snapshot context that is not part
of long-lived finding identity.

### Finding

A **finding** is the human-facing workflow case for one weakness affecting one
asset and one structured affected resource. It owns its title, severity, status,
assignee, due date, mitigation, normalized weakness, and affected resource.

Findings are the things users triage, assign, accept, mitigate, close, and see in
finding-based counts. A finding may link to zero or more vulnerability catalog
entries and may have zero or more observations. Removing its last observation
does not automatically delete, close, or otherwise change the finding.

Every finding records `createdAt`, `updatedAt`, `createdBy`, and `updatedBy`.
Creating, editing, moving, or deleting an attached observation updates the
parent finding's update time and actor because the finding has received changed
supporting information. Moving an observation updates both its previous and new
parent findings.

Deleting an asset is blocked while any finding references it. Deleting a
vulnerability removes its enrichment links without deleting findings. Deleting
a finding deletes its attached observations and enrichment links.

Use **finding** for the workflow case, not for an individual scanner result. Do
not call a finding an issue unless referring to the project issue tracker.

### Observation

An **observation** is a scanner or manual detection record attached to exactly
one finding. It carries source context such as its title, source, severity,
description, evidence, remediation, weakness, affected resource, and observed
time. It inherits its canonical asset through its finding and does not link
directly to vulnerability catalog entries.

Observations have no lifecycle status. Correct an inaccurate observation by
editing, moving, or deleting it; these actions do not automatically change the
finding's workflow state. Imported observations belong to an ingestion. Manual
observations do not.

### Finding Assignee

A **finding assignee** is the single user profile explicitly assigned to handle
a specific finding.

Assignment is optional. An unassigned finding is valid and means no user profile
has been chosen to handle that finding yet. Assignment is distinct from asset
ownership: the asset owner may suggest responsibility, but a finding's assignee
is a per-finding operational decision. When set, the assignee must reference an
existing user profile, including disabled user profiles. If an assigned user
profile is deleted, their findings become unassigned. Assignment is independent
of finding status and remains until explicitly changed or cleared. New findings
start unassigned, including imported findings and manually created findings.
Manual finding creation may set an assignee explicitly.
Attaching imported observations preserves the existing finding assignee.
Changing or clearing assignment is treated as editing the finding itself.
Finding responses expose assignment as an assignee user profile ID; clients
resolve user profile display data separately when needed.
Use **assignee** for finding-level work; avoid calling the assignee an owner.
In UI copy, use assignment or assignee for finding-level responsibility;
reserve owner and ownership for asset ownership.
Use **assigneeId** for the stored and API field that references the assigned
user profile. `assigneeId` is nullable; `null` means the finding is
unassigned. Manual creation may omit `assigneeId`, which also creates an
unassigned finding.

### Finding Due Date

A **finding due date** is the date by which a finding is expected to reach an
explicit handling outcome.

The due date is about handling the finding, not necessarily a technical fix. A
finding satisfies its due date when it reaches `inactive`,
`mitigated`, `risk_accepted`, `false_positive`, `duplicate`, or `out_of_scope`.
A finding remains open against its due date while it is `active` or
`confirmed`. A finding may have no due date; existing findings, imported
findings, and manually created findings without an explicit due date are
undated until a user or later policy assigns one. Use **dueDate** for the
stored and API field. `dueDate` represents a date-only value normalized to the
start of that date, not a user-selected time of day.
Changing finding status does not automatically change or clear the due date.
Past due dates are valid and represent findings that are already overdue.
If a handled finding is reopened, its existing due date becomes active again.
Only findings that are still open against their due date can be overdue; past
due dates on handled findings are historical context. Overdue is derived from
status and due date, not stored as separate finding data.
Users with permission to edit findings may set, change, or clear a due date
regardless of the finding's current status.

### Finding Mitigation

A **finding mitigation** is the recommended or chosen handling guidance for a
specific finding.

Mitigation describes how the finding should be addressed or controlled; it is
distinct from finding status, which records lifecycle state. Scanner output may
call this remediation, but in ExposureNexus use mitigation for finding-level
guidance.

### Observation Source

An **observation source** identifies the scanner or reporting family that
reported an observation. Current sources are:

- `manual`: recorded directly by a user.
- `nuclei`: imported from a Nuclei JSONL export.

One finding may have observations from multiple sources. Source is not a
finding-owned identity or lifecycle field.

### Finding Status

A **finding status** represents the current lifecycle state of a finding.
Current statuses are:

- `active`: reported, but not yet classified as confirmed, false positive,
  duplicate, out of scope, risk accepted, or another terminal state.
- `confirmed`: validated as a real finding and awaiting mitigation or another
  explicit handling decision.
- `inactive`: no longer discovered by scans and closed for human follow-up
  unless it is reopened.
- `false_positive`: determined not to be a real finding.
- `risk_accepted`: real finding whose risk has been explicitly accepted.
- `duplicate`
- `out_of_scope`
- `mitigated`: fixed or otherwise addressed.

Status labels shown to users are capitalized display labels such as "False
Positive" and "Risk Accepted", but code and API payloads use the enum values.

### Severity

**Severity** is shared by vulnerabilities, findings, and observations. Values
are `info`, `low`, `medium`, `high`, and `critical`.

Findings store and own their severity independently of observation and catalog
severity. Vulnerability severity represents upstream or catalog scoring, such
as a CVSS base score. Observation severity records what its source reported.
Finding severity represents the local workflow assessment and may be edited
independently.

## Asset Custom Fields

### Asset Custom Field Definition

An **asset custom field definition** is a registry-level metadata field that can
be assigned to assets. Definitions have a stable machine key, display name,
type, required flag, and optional default value.

Supported types are `text`, `number`, and `select`.

Asset custom fields must not duplicate core asset concepts such as display name,
type, environment, lifecycle state, ownership, identifiers, or audit metadata.
The reserved machine keys are `display_name`, `type`, `environment`,
`lifecycle_state`, `owner_id`, `identifiers`, `created_at`, `updated_at`,
`created_by`, and `updated_by`.

### Asset Custom Field Option

An **asset custom field option** belongs to a select custom field definition.
Options have a stored `value` and a display `label`. Option values are unique
within a field.

### Asset Custom Field Assignment

An **asset custom field assignment** associates a custom field definition with a
specific asset. Assignment is separate from value storage: an asset can have an
assigned field with no asset-specific override.

### Asset Custom Field Value

An **asset custom field value** is an asset-specific override for an assigned
custom field. The API returns effective values for assigned fields using a value
source:

- `asset`: the asset has a stored override.
- `default`: no override exists, so the definition default is used.
- `empty`: neither an override nor a default exists.

Sending `null` for a custom field value clears the asset override.

Assignment and value mutations require an authenticated user profile and update
the parent asset's `updatedAt` and `updatedBy` atomically. No-op replacements do
not advance parent audit metadata or emit an asset update event; successful
changes emit complete previous and current asset snapshots after commit.

## Importing

### Import

An **import** ingests external observations into ExposureNexus. The current
importer supports Nuclei JSONL files.

Imports resolve source records against user-managed assets and findings. They do
not create assets or vulnerability catalog entries. A record whose target cannot
be resolved to one asset does not become an observation.

### Ingestion

An **ingestion** groups observations created from one imported source file or
source dataset. It records the source, scope, actor, creation time, and a summary
of processed, created, skipped, and erroneous records. Manual observations do
not belong to ingestions.

### Vulnerability Source Mapping

A **vulnerability source mapping** links structured source-reported weakness
data to a vulnerability catalog entry for enrichment. A source-specific
weakness may map to more than one catalog entry.

Use this term when discussing how imported scanner output maps onto the
vulnerability catalog. Source mappings add optional enrichment and do not define
finding identity or automatically rewrite existing findings.

## Identity And Access

### User Profile

A **user profile** is an ExposureNexus account with username, email, display name,
enabled flag, password hash, and role assignments.

### User Session

A **user session** is server-side authentication state for a user. Public
session tokens are opaque and stored only in cookies; the database stores HMAC
digests. Sessions include source IP, user agent, creation time, and expiry.

### Role

A **role** is a named set of permissions. Built-in roles are `viewer`,
`editor`, and `admin`. Built-in roles are protected from modification.

### Permission

A **permission** is a resource plus a verb. Resources currently include
`asset`, `custom-field`, `vulnerability`, `import`, `finding`, `session`,
`user`, and `stats`. Verbs are `read`, `write`, and `delete`.

Authorization checks are route-level domain permission checks backed by current
database role assignments, not session-embedded claims.

## Workflows

### Triage Queue

The **triage queue** is the UI workflow for reviewing active findings. It
defaults to findings with status `active` and groups them by asset.

### Mitigation Tracking

**Mitigation tracking** is the workflow of recording how a finding should be or
was addressed. Findings have a `mitigation` field and can move into statuses
such as `confirmed`, `risk_accepted`, and `mitigated`.
Finding workflow and dashboard copy should prefer mitigation; use remediation
only for technical vulnerability guidance or write-ups.

### Dashboard

The **dashboard** summarizes finding statistics by status, severity, and
affected asset. It highlights triage workload, confirmed findings, critical or
high exposure, affected assets, and mitigation rate.

## System Boundaries

- The API owns persistence, authentication, imports, domain services, and route
  authorization.
- Inside the API, routes adapt HTTP and authorization concerns, services own
  application behavior, and repositories adapt persistence.
- The UI owns the authenticated React workflows for dashboard, assets,
  findings, vulnerabilities, users, roles, custom fields, and imports.
- `packages/types` owns shared Zod schemas, enum values, and TypeScript types
  used by both API and UI.
- Asset custom fields currently apply only to assets, not findings,
  vulnerabilities, users, or roles.
- The only implemented external observation source is Nuclei JSONL.

## Vocabulary Rules

- Say **finding** for the human-facing workflow case on an asset.
- Say **observation** for a scanner or manual detection record attached to a
  finding.
- Say **vulnerability** for the reusable catalog entry.
- Say **weakness** for the security problem independent of catalog enrichment.
- Say **affected resource** for the typed part of an asset involved in a
  finding or observation.
- Say **asset display name** for an asset's human-readable label; do not call it
  an identifier.
- Say **asset identifier** for a typed external identity; do not use identifier
  for the asset's internal ID.
- Say **asset identifier namespace** for identity scope; do not use namespace
  for source provenance or arbitrary grouping.
- Say **asset owner** for the user profile responsible for findings on an asset.
- Say **asset custom field** when referring to custom metadata; do not shorten
  to custom field if the surrounding context could imply findings or users.
- Say **user profile** for account data and **user session** for authentication
  state.
- Say **role assignment** for linking a user to a role and **permission
  assignment** for linking a role to permissions.
