# Ownership Design

OpenVLP uses ownership to describe who is responsible for operational follow-up
work. Ownership should be modeled as explicit links to OpenVLP domain objects,
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

Findings do not store owners directly. A finding's responsible owner is derived
from its asset, because a finding is an occurrence of a vulnerability on a
specific asset. This keeps responsibility aligned with the existing
finding-to-asset relationship and avoids creating a competing finding-level
assignment model before a workflow requires it.

## Goals

- Identify the user profile responsible for findings on an asset.
- Allow assets to be explicitly ownerless.
- Keep ownership as a validated user profile reference instead of free text.
- Let finding workflows derive responsibility from linked assets.
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

Imported assets start ownerless unless ownership is set explicitly after
import. Scanner imports must not infer ownership from source data in the first
asset ownership model.

## User Profile Behavior

Asset owners are user profiles. Disabled user profiles can remain asset owners
because login state and business responsibility are separate concerns.

If an owner user profile is deleted, assets owned by that profile become
ownerless at the data level. This keeps asset records valid after user cleanup
and makes responsibility gaps explicit.

## Finding Responsibility

Finding responsibility is derived from the finding's asset:

1. A finding links to an asset.
2. The asset exposes `ownerId`.
3. The UI resolves that user profile separately when displaying the responsible
   owner.

Findings should not gain `ownerId`, assignee, or owner name fields as part of
asset ownership. A separate finding-level assignment model can be introduced
later only if a workflow needs exceptions per finding.

When a finding's asset has `ownerId: null`, responsible-owner displays should
show an explicit no-owner fallback. When the linked asset or referenced user
profile cannot be resolved, displays should use unknown-state fallbacks instead
of silently hiding responsibility.