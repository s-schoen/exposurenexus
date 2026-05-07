# Asset Custom Fields Design

ExposureNexus asset custom fields extend the asset registry with user-defined
metadata without changing the core `asset` table for every new attribute.
Custom fields are defined once at the registry level and can then be assigned
to individual assets. Assigned fields expose an effective value for the asset:
an asset-specific value, a default value, or an empty value.

This document describes the architecture, data model, validation behavior, and
authorization model. It is not an endpoint reference.

## Goals

- Allow users to define named metadata fields for assets.
- Keep supported field value types explicit and controlled by code.
- Store custom field values flexibly without adding one database column per
  custom field.
- Allow assets to opt in to the custom fields that are relevant to them.
- Support default values while still allowing per-asset overrides.
- Keep field definition management separate from editing asset values.
- Validate field definitions and values in the application layer.

## Main Components

Asset custom fields are split across shared types, migrations, repository,
service, and route layers.

- `packages/types/src/model/asset.ts` defines the supported field types,
  definition shapes, value shapes, and request validation schemas.
- `apps/api/src/db/migrations/20260427-asset-custom-fields.ts` creates the
  custom field tables and the database enum for field types.
- `apps/api/src/db/migrations/20260430-03-asset-custom-field-assignments.ts`
  creates the asset-to-field assignment table and backfills existing assets
  with existing definitions.
- `apps/api/src/repository/asset.ts` persists field definitions, select
  options, asset assignments, and per-asset value overrides.
- `apps/api/src/service/asset.ts` validates definitions and values before data
  is written.
- `apps/api/src/routes/asset-custom-fields.ts` exposes registry-level custom
  field definition operations.
- `apps/api/src/routes/assets.ts` exposes asset-specific custom field value
  operations.

Shared custom field shapes live in `packages/types`, so the API, UI, and tests
use the same domain model.

## Field Types

The supported custom field types are predefined in code:

- `text`: stores a string value.
- `number`: stores a numeric value.
- `select`: stores one selected string value from a defined option list.

Each custom field definition has:

- `id`: stable UUID assigned by the database.
- `key`: machine-readable unique identifier, for example `environment`.
- `name`: human-readable label, for example `Environment`.
- `type`: one of the supported custom field types.
- `required`: whether the field must have a default value.
- `defaultValue`: optional registry-level fallback value.

Select fields also have ordered-independent options. Each option has:

- `id`
- `fieldId`
- `value`
- `label`

The `key` is unique across all asset custom fields. It is intended for stable
programmatic identification, while `name` and option labels are intended for
display.

## Data Model

Custom field definitions are stored in `asset_custom_field`.

Important fields include:

- `key`
- `name`
- `type`
- `required`
- `defaultValue`

Select options are stored separately in `asset_custom_field_option`. Options
belong to a field through `fieldId`, and each option value is unique within a
field.

Per-asset values are stored in `asset_custom_field_value`.

Important fields include:

- `assetId`
- `fieldId`
- `value`

The `(assetId, fieldId)` pair is the primary key. This means an asset can have
at most one stored override for each custom field.

Asset-to-field associations are stored in `asset_custom_field_assignment`.

Important fields include:

- `assetId`
- `fieldId`

The `(assetId, fieldId)` pair is the primary key. This means a field can be
assigned to an asset at most once. Assignments are separate from values: an
asset may have an assigned field without an asset-specific override.

`defaultValue` and `value` are stored as `jsonb`. The database stores the raw
JSON scalar, while the service layer interprets and validates it according to
the field definition type. This keeps the schema simple and avoids separate
columns such as `textValue` and `numberValue`.

## Definition Flow

Custom field definitions are global to the asset registry.

1. A client sends a custom field definition.
2. The route validates the request shape with the shared schema.
3. The service validates type-specific rules.
4. The repository stores the definition in `asset_custom_field`.
5. For select fields, the repository stores options in
   `asset_custom_field_option`.
6. The API returns the saved definition, including generated IDs.

Updating a definition replaces the persisted definition and replaces select
options for that field. Deleting a definition removes the definition and relies
on cascading foreign keys to remove its options, asset assignments, and
per-asset values.

## Assignment Flow

Custom field definitions are global, but assets explicitly choose which fields
are associated with them.

When a client lists available fields for an asset, the API returns the field
definitions that exist globally but are not currently assigned to that asset.

Assigning fields to an asset:

1. The target asset must exist.
2. Every requested field ID must reference an existing definition.
3. The repository inserts missing `(assetId, fieldId)` assignments.
4. The API returns the effective values for the assigned fields.

Assignment is idempotent. Sending an already assigned field ID does not create a
duplicate because the assignment table is keyed by `(assetId, fieldId)`.

Detaching a field from an asset removes both the assignment and any stored
per-asset override for that field. It does not delete the global field
definition, and it does not affect other assets.

## Value Flow

When custom field values are listed for an asset, the API returns one effective
value object per assigned field:

- `source = "asset"` when the asset has a stored override.
- `source = "default"` when no override exists and the definition has a
  default value.
- `source = "empty"` when neither an override nor a default value exists.

Writing custom field values only stores per-asset overrides in
`asset_custom_field_value`. The field must already be assigned to the asset.
Sending `null` for a field removes the stored override, so the effective value
falls back to the field default or becomes empty.

Clearing a value also removes the stored override and returns a standard object
reply indicating that the clear operation was applied.

## Validation

The database keeps the schema intentionally simple. Type-specific rules are
validated in the service layer.

Field definition validation includes:

- Required fields must define a non-null default value.
- Text defaults must be strings.
- Number defaults must be numbers.
- Select fields must define at least one option.
- Select option values must be unique within the field.
- Select defaults must be strings and must match an option value.

Value validation includes:

- The target asset must exist.
- Each updated field ID must reference an existing custom field definition.
- Each updated or cleared field must be assigned to the target asset.
- Text field values must be strings or `null`.
- Number field values must be numbers or `null`.
- Select field values must be strings matching an option value, or `null`.

`null` is treated as a request to remove the per-asset override, not as a stored
JSON value.

Assignment validation includes:

- The target asset must exist.
- Each assigned or detached field ID must reference an existing custom field
  definition.

## Authorization

Custom fields use two permission resources because definition management and
asset value editing are different operations.

Registry-level custom field definition operations require the `custom-field`
resource:

- reading custom field definitions requires `custom-field:read`
- creating or updating definitions requires `custom-field:write`
- deleting definitions requires `custom-field:delete`

Asset-specific custom field value operations require the `asset` resource:

- listing available fields for an asset requires `asset:read`
- reading effective field values for an asset requires `asset:read`
- assigning or detaching fields on an asset requires `asset:write`
- writing or clearing values on an asset requires `asset:write`

This allows administrators to control who may change the asset metadata schema
separately from who may fill in values on individual assets.

## Failure Behavior

The service layer maps expected validation and persistence failures to domain
errors.

- Invalid definitions and invalid values return bad-request responses.
- Duplicate custom field keys return conflict responses.
- Missing assets return not-found responses from asset-specific routes.
- Missing field definitions return not-found responses for definition routes
  and bad-request responses when referenced by asset value or assignment
  updates.
- Writing or clearing values for fields that are not assigned to the asset
  returns a bad-request response.
- Unexpected repository or database failures return internal server errors.

Route handlers keep response envelopes consistent by using the shared reply
helpers for arrays and objects.

## Current Boundaries

The initial asset custom field implementation is intentionally scoped to asset
metadata.

The API does not currently support:

- custom fields for vulnerabilities, findings, or other domain objects
- field groups or advanced field visibility rules
- multi-select fields
- date, boolean, file, or rich-text field types
- database-level JSON type check constraints for stored values
- historical tracking of custom field value changes

The API remains the authority for field definitions, effective values,
validation, and permissions.
