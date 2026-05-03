# OpenVLP Context

OpenVLP is a vulnerability lifecycle platform. It collects findings from manual
entry and external scanners, normalizes them around assets and vulnerabilities,
and gives users workflows for triage, mitigation tracking, asset metadata, and
access control.

Use this file as the domain glossary for issues, PRDs, refactors, tests, and
agent work. Prefer these terms over close synonyms.

## Core Domain

### Asset

An **asset** is a system or component tracked by OpenVLP. Current asset types
are `host`, `software`, and `container`.

Assets are the things affected by findings. Imports may create assets when an
external finding references an asset that is not already in the registry.
Treat asset type values as labels without deeper domain semantics for now.

### Vulnerability

A **vulnerability** is a catalog entry describing a weakness that can affect one
or more assets. It has a title, severity, optional description, optional CVE,
and optional CWE.

Use **vulnerability** for the catalog item, not for a concrete occurrence on an
asset. The concrete occurrence is a finding.

### Finding

A **finding** is an occurrence of a vulnerability on a specific asset. It links
one asset to one vulnerability and carries the operational lifecycle data:
severity, status, source, evidence, mitigation, first seen time, last seen time,
and fingerprint.

Use **finding** for anything being triaged, deduplicated, imported, mitigated,
or displayed in the finding table. Do not call this an issue unless referring to
the project issue tracker.

### Finding Source

A **finding source** identifies where a finding came from. Current sources are:

- `manual`: created directly by a user.
- `nuclei`: imported from a Nuclei JSONL export.

The import system is intentionally source-aware so other scanners can be added
without changing the finding model.

### Fingerprint

A **fingerprint** is the deduplication key for a finding. It is currently
derived from vulnerability ID, asset ID, and optional source-specific fields.
The Nuclei importer includes port and path in the fingerprint options.

When an imported finding has the same fingerprint as an existing finding, the
existing finding is updated and its `lastSeen` timestamp moves forward instead
of creating a duplicate.

### Finding Status

A **finding status** represents the current lifecycle state of a finding.
Current statuses are:

- `active`: reported, but not yet classified as confirmed, false positive,
  duplicate, out of scope, risk accepted, or another terminal state.
- `confirmed`: validated as a real finding and awaiting remediation or another
  explicit handling decision.
- `inactive`: no longer discovered by scans, but not necessarily fixed,
  mitigated, or accepted.
- `false_positive`: determined not to be a real finding.
- `risk_accepted`: real finding whose risk has been explicitly accepted.
- `duplicate`
- `out_of_scope`
- `mitigated`: fixed or otherwise remediated.

Status labels shown to users are capitalized display labels such as "False
Positive" and "Risk Accepted", but code and API payloads use the enum values.

### Severity

**Severity** is shared by vulnerabilities and findings. Values are `info`,
`low`, `medium`, `high`, and `critical`.

Findings store their own severity even though each finding also links to a
vulnerability with a severity. Vulnerability severity represents upstream or
catalog scoring, such as a CVSS base score. Finding severity represents the
local impact for that asset and environment, such as a CVSS environmental
score, and may be edited independently.

## Asset Custom Fields

### Asset Custom Field Definition

An **asset custom field definition** is a registry-level metadata field that can
be assigned to assets. Definitions have a stable machine key, display name,
type, required flag, and optional default value.

Supported types are `text`, `number`, and `select`.

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

## Importing

### Import

An **import** ingests external findings into OpenVLP. The current importer
supports Nuclei JSONL files.

The import flow parses each source record, finds or creates the matching
vulnerability, finds or creates the target asset, then creates or updates the
finding based on its fingerprint.

### Vulnerability Source Mapping

A **vulnerability source mapping** links an external source-specific match query
to an OpenVLP vulnerability. Nuclei mappings currently use the template ID as
the match query.

Use this term when discussing how imported scanner output maps onto the
vulnerability catalog.

## Identity And Access

### User Profile

A **user profile** is an OpenVLP account with username, email, display name,
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

### Dashboard

The **dashboard** summarizes finding statistics by status, severity, source,
and affected asset. It highlights triage workload, confirmed findings, critical
or high exposure, affected assets, and mitigation rate.

## System Boundaries

- The API owns persistence, authentication, imports, domain services, and route
  authorization.
- The UI owns the authenticated React workflows for dashboard, assets,
  findings, vulnerabilities, users, roles, custom fields, and imports.
- `packages/types` owns shared Zod schemas, enum values, and TypeScript types
  used by both API and UI.
- Asset custom fields currently apply only to assets, not findings,
  vulnerabilities, users, or roles.
- The only implemented external finding source is Nuclei JSONL.

## Vocabulary Rules

- Say **finding** for an observed vulnerability on an asset.
- Say **vulnerability** for the reusable catalog entry.
- Say **asset custom field** when referring to custom metadata; do not shorten
  to custom field if the surrounding context could imply findings or users.
- Say **user profile** for account data and **user session** for authentication
  state.
- Say **role assignment** for linking a user to a role and **permission
  assignment** for linking a role to permissions.
