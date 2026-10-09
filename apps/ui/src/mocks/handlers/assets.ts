import {
  AssetEnvironment,
  AssetLifecycleState,
  createAssetIdentifierSchema,
  createAssetSchema,
  updateAssetIdentifierSchema,
  updateAssetSchema,
} from "@exposurenexus/contracts/model/asset";
import {
  updateAssetCustomFieldAssociationsSchema,
  updateAssetCustomFieldValuesSchema,
} from "@exposurenexus/contracts/model/asset-custom-field";
import { delay, http } from "msw";

import { listAssetCustomFieldValues, projectAssetWithCustomFields } from "@/mocks/db.ts";
import { apiPath, createdAudit, newId, updatedAudit } from "@/mocks/handlers/shared.ts";
import { parseRequestBody, replyArray, replyNotFound, replyObject } from "@/mocks/reply.ts";

import type { MockDb } from "@/mocks/db.ts";
import type { Asset } from "@exposurenexus/contracts/model/asset";

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
  return [
    http.get(apiPath("/assets"), async ({ request }) => {
      await delay();
      const params = new URL(request.url).searchParams;
      const assets = filterAssets(db.assets.all(), params);
      return params.get("includeCustomFields") === "true"
        ? replyArray(assets.map((asset) => projectAssetWithCustomFields(db, asset)))
        : replyArray(assets);
    }),

    http.post(apiPath("/assets"), async ({ request }) => {
      await delay();
      const body = await parseRequestBody(request, createAssetSchema);
      if ("reply" in body) {
        return body.reply;
      }
      const { identifiers = [], ...input } = body.data;
      const asset: Asset = {
        environment: AssetEnvironment.Unknown,
        lifecycleState: AssetLifecycleState.Active,
        ...input,
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

    http.get<{ id: string }>(apiPath("/assets/:id"), async ({ params }) => {
      await delay();
      const asset = db.assets.get(params.id);
      return asset ? replyObject(asset) : replyNotFound("asset");
    }),

    http.patch<{ id: string }>(apiPath("/assets/:id"), async ({ params, request }) => {
      await delay();
      const body = await parseRequestBody(request, updateAssetSchema);
      if ("reply" in body) {
        return body.reply;
      }
      const asset = db.assets.update(params.id, { ...body.data, ...updatedAudit(db) });
      return asset ? replyObject(asset) : replyNotFound("asset");
    }),

    http.delete<{ id: string }>(apiPath("/assets/:id"), async ({ params }) => {
      await delay();
      const asset = db.assets.remove(params.id);
      if (!asset) {
        return replyNotFound("asset");
      }
      db.customFieldAssignments.delete(asset.id);
      return replyObject(asset);
    }),

    http.post<{ id: string }>(apiPath("/assets/:id/identifiers"), async ({ params, request }) => {
      await delay();
      const asset = db.assets.get(params.id);
      if (!asset) {
        return replyNotFound("asset");
      }
      const body = await parseRequestBody(request, createAssetIdentifierSchema);
      if ("reply" in body) {
        return body.reply;
      }
      const identifier = { ...body.data, id: newId("assetIdentifier") };
      db.assets.update(asset.id, {
        identifiers: [...asset.identifiers, identifier],
        ...updatedAudit(db),
      });
      return replyObject(identifier, { created: true });
    }),

    http.put<{ id: string; identifierId: string }>(
      apiPath("/assets/:id/identifiers/:identifierId"),
      async ({ params, request }) => {
        await delay();
        const asset = db.assets.get(params.id);
        if (!asset?.identifiers.some((identifier) => identifier.id === params.identifierId)) {
          return replyNotFound("asset identifier");
        }
        const body = await parseRequestBody(request, updateAssetIdentifierSchema);
        if ("reply" in body) {
          return body.reply;
        }
        const updated = { ...body.data, id: params.identifierId };
        db.assets.update(asset.id, {
          identifiers: asset.identifiers.map((identifier) =>
            identifier.id === updated.id ? updated : identifier,
          ),
          ...updatedAudit(db),
        });
        return replyObject(updated);
      },
    ),

    http.delete<{ id: string; identifierId: string }>(
      apiPath("/assets/:id/identifiers/:identifierId"),
      async ({ params }) => {
        await delay();
        const asset = db.assets.get(params.id);
        const removed = asset?.identifiers.find(
          (identifier) => identifier.id === params.identifierId,
        );
        if (!asset || !removed) {
          return replyNotFound("asset identifier");
        }
        db.assets.update(asset.id, {
          identifiers: asset.identifiers.filter((identifier) => identifier !== removed),
          ...updatedAudit(db),
        });
        return replyObject(removed);
      },
    ),

    http.get<{ id: string }>(apiPath("/assets/:id/custom-fields"), async ({ params }) => {
      await delay();
      return db.assets.get(params.id)
        ? replyArray(listAssetCustomFieldValues(db, params.id))
        : replyNotFound("asset");
    }),

    http.get<{ id: string }>(apiPath("/assets/:id/custom-fields/available"), async ({ params }) => {
      await delay();
      if (!db.assets.get(params.id)) {
        return replyNotFound("asset");
      }
      const assigned = db.customFieldAssignments.get(params.id) ?? new Map();
      return replyArray(
        db.customFields
          .all()
          .filter((definition) => !assigned.has(definition.id))
          .sort((a, b) => a.key.localeCompare(b.key)),
      );
    }),

    http.put<{ id: string }>(apiPath("/assets/:id/custom-fields"), async ({ params, request }) => {
      await delay();
      if (!db.assets.get(params.id)) {
        return replyNotFound("asset");
      }
      const body = await parseRequestBody(request, updateAssetCustomFieldValuesSchema);
      if ("reply" in body) {
        return body.reply;
      }
      const assignments = db.customFieldAssignments.get(params.id) ?? new Map();
      for (const { fieldId, value } of body.data.values) {
        assignments.set(fieldId, value);
      }
      db.customFieldAssignments.set(params.id, assignments);
      return replyArray(listAssetCustomFieldValues(db, params.id));
    }),

    http.put<{ id: string }>(
      apiPath("/assets/:id/custom-fields/associations"),
      async ({ params, request }) => {
        await delay();
        if (!db.assets.get(params.id)) {
          return replyNotFound("asset");
        }
        const body = await parseRequestBody(request, updateAssetCustomFieldAssociationsSchema);
        if ("reply" in body) {
          return body.reply;
        }
        const previous = db.customFieldAssignments.get(params.id) ?? new Map();
        db.customFieldAssignments.set(
          params.id,
          new Map(body.data.fieldIds.map((fieldId) => [fieldId, previous.get(fieldId)])),
        );
        return replyArray(listAssetCustomFieldValues(db, params.id));
      },
    ),
  ];
}
