# Ownership Design

ExposureNexus uses ownership to describe who is responsible for operational follow-up
work. Ownership should be modeled as explicit links to ExposureNexus domain objects,
not as free text, so responsibility can be validated, displayed consistently,
and reused by workflows.

This document describes ownership concepts and rules. It is not an endpoint
reference.

## Asset Owner

An **asset owner** is the single user profile responsible for handling findings
on an asset.

Asset ownership is part of core asset metadata. Each asset has a nullable
`ownerId` that either references an existing user profile or is `null` when the
owner is not known. Ownerless assets are valid, explicit domain state rather
than incomplete records.

Findings do not store owners directly. A finding may have one assignee, which is
distinct from the asset owner. Asset ownership describes durable responsibility
for an asset; finding assignment describes who is handling one specific finding.

## Goals

- Identify the user profile responsible for findings on an asset.
- Allow assets to be explicitly ownerless.
- Keep ownership as a validated user profile reference instead of free text.
- Let finding workflows assign specific findings without changing asset
  ownership.
- Keep asset ownership editable as normal asset metadata.
- Avoid embedding user display data in asset responses.

## Data Model

Asset ownership is represented by `ownerId` on the base asset model.

`ownerId` is nullable:

- a user profile ID means the asset has that user profile as its owner
- `null` means the asset has no known owner

When `ownerId` is non-null, it must reference an existing user profile.
Unknown user profile IDs are invalid input.

Asset responses expose owner identity as `ownerId`. Clients resolve user
profile display data separately through user profile APIs when they need to
show names or other user details.

## Ownership Lifecycle

Ownership can be set when an asset is created. This lets users record the
responsible user profile without a second edit step when the owner is already
known.

Ownership can be changed after creation. Changing ownership is treated as
editing asset metadata and uses the existing `asset:write` permission.

Ownership can be cleared explicitly by setting `ownerId` to `null`. Clearing
ownership means responsibility is unknown; it is distinct from assigning an
invalid or missing user profile.

Automated scanner import is currently work in progress and returns `501 Not
Implemented`. Import-time asset ownership behavior is not defined yet.

## User Profile Behavior

Asset owners are user profiles. Disabled user profiles can remain asset owners
because login state and business responsibility are separate concerns.

If an owner user profile is deleted, assets owned by that profile become
ownerless at the data level. This keeps asset records valid after user cleanup
and makes responsibility gaps explicit.

## Finding Responsibility And Assignment

Finding responsibility can be understood at two levels:

1. A finding links to an asset.
2. The asset exposes `ownerId`, identifying the asset owner.
3. The finding may expose one assignee, identifying the user profile currently
   assigned to handle that specific finding.

Finding assignees should not be called owners. The asset owner is not
necessarily the finding assignee, and a finding may have no assignee at all.

When a finding's asset has `ownerId: null`, responsible-owner displays should
show an explicit no-owner fallback. When the linked asset or referenced user
profile cannot be resolved, displays should use unknown-state fallbacks instead
of silently hiding responsibility.

When a finding has no assignee, assignment displays should show an explicit
unassigned fallback rather than deriving or copying the asset owner.

Finding assignees are user profiles. Disabled user profiles can be assigned,
matching asset-owner semantics: login state and operational responsibility are
separate concerns.

If an assignee user profile is deleted, findings assigned to that profile
become unassigned at the data level.

Finding assignment is independent of finding status. Status changes such as
confirming, accepting risk, mitigating, or reactivating do not clear or change
the assignee.

Manually created findings start unassigned by default. Asset ownership can be
shown as context, but it is not copied into the finding assignment.

Manual finding creation may set an assignee explicitly, but the default is
unassigned.

Assignment behavior for automated imports is not defined while the import
endpoint remains unavailable.

The first assignment model does not keep dedicated assignment history. The
normal finding audit fields still show the most recent update metadata, but
ExposureNexus will not answer historical assignment questions until a later workflow
requires it.

The first assignment workflow does not send email or in-app notifications.
Assignees discover assigned findings through the normal finding views, grouping,
and filters.

Creating, changing, or clearing a finding assignee uses the existing
`finding:write` permission.

Changing or clearing assignment is a normal finding edit. It does not require a
separate assignment workflow object.

Finding responses expose assignee identity as an assignee user profile ID.
Clients resolve user profile display data separately through user profile APIs
when they need to show names or other user details.
Use `assigneeId` consistently for the stored field and API payload property.
`assigneeId` is nullable: a user profile ID means the finding has that user
profile as its assignee, and `null` means the finding is unassigned. Manual
finding creation may omit `assigneeId`, matching asset-owner creation
semantics.

The first finding-assignment workflow should show assignment in the findings
table, finding detail page, and triage queue. Assignment should be editable from
the finding detail workflow and any normal finding create or edit form. Inline
table editing and bulk assignment are outside the first assignment workflow.
The findings table should treat assignee as a first-class workload dimension:
show it as a column, support grouping by assignee, and support filtering by
assignee with an explicit unassigned option where the existing table filter
model can support it cleanly.
