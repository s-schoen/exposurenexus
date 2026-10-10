import {
  AssetEnvironment,
  AssetLifecycleState,
  createAssetIdentifierSchema,
  createAssetSchema,
  updateAssetIdentifierSchema,
  updateAssetSchema,
} from "@exposurenexus/contracts/model/asset";
import {
  AssetCustomFieldType,
  updateAssetCustomFieldAssociationsSchema,
  updateAssetCustomFieldValuesSchema,
} from "@exposurenexus/contracts/model/asset-custom-field";
import { PermissionResource, PermissionVerb } from "@exposurenexus/contracts/model/rbac";
import { delay, http } from "msw";

import {
  listAssetCustomFieldValues,
  listCustomFieldDefinitions,
  projectAssetWithCustomFields,
} from "@/mocks/db.ts";
import {
  apiPath,
  createdAudit,
  newId,
  requirePermission,
  updatedAudit,
} from "@/mocks/handlers/shared.ts";
import {
  parseRequestBody,
  replyArray,
  replyError,
  replyNotFound,
  replyObject,
} from "@/mocks/reply.ts";

import type { AssetCustomFieldStoredValue, MockDb } from "@/mocks/db.ts";
import type { Asset, AssetIdentifier } from "@exposurenexus/contracts/model/asset";
import type {
  AssetCustomFieldValue,
  UpdateAssetCustomFieldValue,
} from "@exposurenexus/contracts/model/asset-custom-field";

const { Asset: AssetResource } = PermissionResource;
const { Read, Write, Delete } = PermissionVerb;

type IdentifierIdentity = Pick<AssetIdentifier, "type" | "namespace" | "value">;

function sameIdentity(a: IdentifierIdentity, b: IdentifierIdentity): boolean {
  return a.type === b.type && a.namespace === b.namespace && a.value === b.value;
}

function isValidValue(field: AssetCustomFieldValue, value: AssetCustomFieldStoredValue): boolean {
  switch (field.type) {
    case AssetCustomFieldType.Text:
      return typeof value === "string";
    case AssetCustomFieldType.Number:
      return typeof value === "number";
    case AssetCustomFieldType.Select:
      return field.options.some((option) => option.value === value);
  }
}

function hasDuplicates(values: Array<string>): boolean {
  return new Set(values).size !== values.length;
}

function listParam(params: URLSearchParams, name: string): Array<string> | undefined {
  const value = params.get(name);
  return value ? value.split(",") : undefined;
}

/** Same filters as `GET /api/assets`: search over name and identifier values, then facets. */
function filterAssets(assets: Array<Asset>, params: URLSearchParams): Array<Asset> {
  const search = params.get("filter")?.trim().toLowerCase();
  const types = listParam(params, "assetType");
  const environments = listParam(params, "assetEnvironment");
  const lifecycleStates = listParam(params, "assetLifecycleState");
  const ownerIds = listParam(params, "assetOwnerId")?.map((id) => (id === "none" ? null : id));

  return assets.filter(
    (asset) =>
      (!search ||
        asset.displayName.toLowerCase().includes(search) ||
        asset.identifiers.some((identifier) => identifier.value.toLowerCase().includes(search))) &&
      (!types || types.includes(asset.type)) &&
      (!environments || environments.includes(asset.environment)) &&
      (!lifecycleStates || lifecycleStates.includes(asset.lifecycleState)) &&
      (!ownerIds || ownerIds.includes(asset.ownerId)),
  );
}

export function createAssetHandlers(db: MockDb) {
  /** The API's unique identifier index spans all assets. */
  const identifierTaken = (identifier: IdentifierIdentity, exceptId?: string) =>
    db.assets
      .all()
      .some((asset) =>
        asset.identifiers.some(
          (existing) => existing.id !== exceptId && sameIdentity(existing, identifier),
        ),
      );
  const identifierConflict = () =>
    replyError(409, "asset identifier is already owned by another asset");
  const displayNameInvalid = (displayName: string) =>
    displayName.length === 0 || displayName.length > 255
      ? replyError(400, "asset display name must contain 1 to 255 characters")
      : undefined;
  const ownerUnknown = (ownerId: string | null | undefined) =>
    ownerId && !db.users.get(ownerId) ? replyError(400, "asset owner does not exist") : undefined;

  /** The API's checks for `PUT /assets/:id/custom-fields`, which replaces every value. */
  const rejectValues = (assetId: string, values: Array<UpdateAssetCustomFieldValue>) => {
    const fields = listAssetCustomFieldValues(db, assetId);
    if (hasDuplicates(values.map((value) => value.fieldId))) {
      return replyError(400, "asset custom field values contain duplicate fields");
    }
    if (!fields.every((field) => values.some((value) => value.fieldId === field.fieldId))) {
      return replyError(400, "asset custom field value replacement is incomplete");
    }
    for (const { fieldId, value } of values) {
      const field = fields.find((candidate) => candidate.fieldId === fieldId);
      if (!field) {
        return replyError(400, "asset custom field is not assigned to asset");
      }
      if (value !== null && !isValidValue(field, value)) {
        return replyError(400, "invalid asset custom field value");
      }
    }
    return undefined;
  };

  return [
    http.get(
      apiPath("/assets"),
      requirePermission(db, AssetResource, Read, async ({ request }) => {
        await delay();
        const params = new URL(request.url).searchParams;
        const assets = filterAssets(db.assets.all(), params);
        return params.get("includeCustomFields") === "true"
          ? replyArray(assets.map((asset) => projectAssetWithCustomFields(db, asset)))
          : replyArray(assets);
      }),
    ),

    // Environment and lifecycle state default like the API; the asset starts with no fields.
    http.post(
      apiPath("/assets"),
      requirePermission(db, AssetResource, Write, async ({ request }) => {
        await delay();
        const body = await parseRequestBody(request, createAssetSchema);
        if ("reply" in body) {
          return body.reply;
        }
        const { identifiers = [], ...input } = body.data;
        const displayName = input.displayName.trim();
        const rejected =
          displayNameInvalid(displayName) ??
          (identifiers.some((identifier, index) =>
            identifiers.slice(index + 1).some((other) => sameIdentity(identifier, other)),
          )
            ? replyError(400, "asset identifiers must be unique")
            : undefined) ??
          ownerUnknown(input.ownerId) ??
          (identifiers.some((identifier) => identifierTaken(identifier))
            ? identifierConflict()
            : undefined);
        if (rejected) {
          return rejected;
        }
        const asset: Asset = {
          environment: AssetEnvironment.Unknown,
          lifecycleState: AssetLifecycleState.Active,
          ...input,
          displayName,
          ownerId: input.ownerId ?? null,
          id: newId("asset"),
          identifiers: identifiers.map((identifier) => ({
            ...identifier,
            id: newId("assetIdentifier"),
          })),
          ...createdAudit(db),
        };
        db.assets.insert(asset);
        return replyObject(asset, { created: true });
      }),
    ),

    http.get<{ id: string }>(
      apiPath("/assets/:id"),
      requirePermission(db, AssetResource, Read, async ({ params }) => {
        await delay();
        const asset = db.assets.get(params.id);
        return asset ? replyObject(asset) : replyNotFound("asset", params.id);
      }),
    ),

    http.patch<{ id: string }>(
      apiPath("/assets/:id"),
      requirePermission(db, AssetResource, Write, async ({ params, request }) => {
        await delay();
        const body = await parseRequestBody(request, updateAssetSchema);
        if ("reply" in body) {
          return body.reply;
        }
        const patch = {
          ...body.data,
          ...(body.data.displayName === undefined
            ? {}
            : { displayName: body.data.displayName.trim() }),
        };
        const invalidName =
          patch.displayName === undefined ? undefined : displayNameInvalid(patch.displayName);
        if (invalidName) {
          return invalidName;
        }
        if (!db.assets.get(params.id)) {
          return replyNotFound("asset", params.id);
        }
        const unknownOwner = ownerUnknown(patch.ownerId);
        if (unknownOwner) {
          return unknownOwner;
        }
        return replyObject(db.assets.update(params.id, { ...patch, ...updatedAudit(db) })!);
      }),
    ),

    // Refused while findings reference the asset; identifiers and custom-field data cascade.
    http.delete<{ id: string }>(
      apiPath("/assets/:id"),
      requirePermission(db, AssetResource, Delete, async ({ params }) => {
        await delay();
        const asset = db.assets.get(params.id);
        if (!asset) {
          return replyNotFound("asset", params.id);
        }
        if (db.findings.all().some((finding) => finding.assetId === asset.id)) {
          return replyError(409, `asset ${asset.id} is still referenced by findings`);
        }
        db.assets.remove(asset.id);
        db.customFieldAssignments.delete(asset.id);
        return replyObject(asset);
      }),
    ),

    http.post<{ id: string }>(
      apiPath("/assets/:id/identifiers"),
      requirePermission(db, AssetResource, Write, async ({ params, request }) => {
        await delay();
        const body = await parseRequestBody(request, createAssetIdentifierSchema);
        if ("reply" in body) {
          return body.reply;
        }
        const asset = db.assets.get(params.id);
        if (!asset) {
          return replyNotFound("asset", params.id);
        }
        if (identifierTaken(body.data)) {
          return identifierConflict();
        }
        const identifier = { ...body.data, id: newId("assetIdentifier") };
        db.assets.update(asset.id, {
          identifiers: [...asset.identifiers, identifier],
          ...updatedAudit(db),
        });
        return replyObject(identifier, { created: true });
      }),
    ),

    http.put<{ id: string; identifierId: string }>(
      apiPath("/assets/:id/identifiers/:identifierId"),
      requirePermission(db, AssetResource, Write, async ({ params, request }) => {
        await delay();
        const body = await parseRequestBody(request, updateAssetIdentifierSchema);
        if ("reply" in body) {
          return body.reply;
        }
        const asset = db.assets.get(params.id);
        if (!asset?.identifiers.some((identifier) => identifier.id === params.identifierId)) {
          return replyNotFound("asset identifier", params.identifierId);
        }
        if (identifierTaken(body.data, params.identifierId)) {
          return identifierConflict();
        }
        const updated = { ...body.data, id: params.identifierId };
        db.assets.update(asset.id, {
          identifiers: asset.identifiers.map((identifier) =>
            identifier.id === updated.id ? updated : identifier,
          ),
          ...updatedAudit(db),
        });
        return replyObject(updated);
      }),
    ),

    http.delete<{ id: string; identifierId: string }>(
      apiPath("/assets/:id/identifiers/:identifierId"),
      requirePermission(db, AssetResource, Write, async ({ params }) => {
        await delay();
        const asset = db.assets.get(params.id);
        const removed = asset?.identifiers.find(
          (identifier) => identifier.id === params.identifierId,
        );
        if (!asset || !removed) {
          return replyNotFound("asset identifier", params.identifierId);
        }
        db.assets.update(asset.id, {
          identifiers: asset.identifiers.filter((identifier) => identifier !== removed),
          ...updatedAudit(db),
        });
        return replyObject(removed);
      }),
    ),

    http.get<{ id: string }>(
      apiPath("/assets/:id/custom-fields"),
      requirePermission(db, AssetResource, Read, async ({ params }) => {
        await delay();
        return db.assets.get(params.id)
          ? replyArray(listAssetCustomFieldValues(db, params.id))
          : replyNotFound("asset", params.id);
      }),
    ),

    http.get<{ id: string }>(
      apiPath("/assets/:id/custom-fields/available"),
      requirePermission(db, AssetResource, Read, async ({ params }) => {
        await delay();
        if (!db.assets.get(params.id)) {
          return replyNotFound("asset", params.id);
        }
        const assigned = db.customFieldAssignments.get(params.id) ?? new Map();
        return replyArray(
          listCustomFieldDefinitions(db).filter((definition) => !assigned.has(definition.id)),
        );
      }),
    ),

    // Replaces every value of the asset's assigned fields. `null` clears the per-asset value, so
    // the definition default applies again.
    http.put<{ id: string }>(
      apiPath("/assets/:id/custom-fields"),
      requirePermission(db, AssetResource, Write, async ({ params, request }) => {
        await delay();
        const body = await parseRequestBody(request, updateAssetCustomFieldValuesSchema);
        if ("reply" in body) {
          return body.reply;
        }
        if (!db.assets.get(params.id)) {
          return replyNotFound("asset", params.id);
        }
        const rejected = rejectValues(params.id, body.data.values);
        if (rejected) {
          return rejected;
        }
        db.customFieldAssignments.set(
          params.id,
          new Map(body.data.values.map(({ fieldId, value }) => [fieldId, value ?? undefined])),
        );
        return replyArray(listAssetCustomFieldValues(db, params.id));
      }),
    ),

    // Replaces the assigned fields; values of fields that stay assigned are kept.
    http.put<{ id: string }>(
      apiPath("/assets/:id/custom-fields/associations"),
      requirePermission(db, AssetResource, Write, async ({ params, request }) => {
        await delay();
        const body = await parseRequestBody(request, updateAssetCustomFieldAssociationsSchema);
        if ("reply" in body) {
          return body.reply;
        }
        if (!db.assets.get(params.id)) {
          return replyNotFound("asset", params.id);
        }
        const { fieldIds } = body.data;
        if (hasDuplicates(fieldIds)) {
          return replyError(400, "asset custom field assignments contain duplicate fields");
        }
        if (!fieldIds.every((fieldId) => db.customFields.get(fieldId))) {
          return replyError(400, "unknown asset custom field");
        }
        const previous = db.customFieldAssignments.get(params.id) ?? new Map();
        db.customFieldAssignments.set(
          params.id,
          new Map(fieldIds.map((fieldId) => [fieldId, previous.get(fieldId)])),
        );
        return replyArray(listAssetCustomFieldValues(db, params.id));
      }),
    ),
  ];
}
