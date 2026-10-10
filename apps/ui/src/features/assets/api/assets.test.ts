import {
  AssetEnvironment,
  AssetIdentifierType,
  AssetLifecycleState,
  AssetType,
} from "@exposurenexus/contracts/model/asset";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addAssetIdentifier,
  createAsset,
  deleteAsset,
  deleteAssetIdentifier,
  getAssetByID,
  listAssetCustomFieldValues,
  listAssets,
  listAssetsWithCustomFields,
  listAvailableAssetCustomFieldDefinitions,
  replaceAssetCustomFieldAssociations,
  updateAsset,
  updateAssetCustomFieldValues,
  updateAssetIdentifier,
} from "@/features/assets/api/assets.ts";
import { APIError } from "@/lib/api-client.ts";
import { SEED_ASSETS, SEED_ASSETS_WITH_CUSTOM_FIELDS, SEED_USERS } from "@/mocks/fixtures/index.ts";
import { captureApiCalls, mockApiError, mockApiReply } from "@/test/msw.ts";

// Happy-path requests and bodies are covered by src/mocks/handlers/handlers.test.ts, whose
// handlers validate bodies with the contracts schemas. This covers list query strings and
// error and reply handling.

const [asset] = SEED_ASSETS;
const [identifier] = asset.identifiers;
const identifierInput = {
  type: AssetIdentifierType.DnsName,
  namespace: null,
  value: "a.example.com",
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("asset list query strings", () => {
  it("sends search and core filters as comma-separated params", async () => {
    const calls = captureApiCalls("get", "/assets");

    await listAssets({
      filter: " api.example.com ",
      assetType: [AssetType.Host, AssetType.Software],
      assetEnvironment: [AssetEnvironment.Production],
      assetLifecycleState: [AssetLifecycleState.Archived],
      assetOwnerId: [SEED_USERS[0].id, "none"],
    });

    expect(calls[0].url.search).toBe(
      `?filter=api.example.com&assetType=host%2Csoftware&assetEnvironment=production&assetLifecycleState=archived&assetOwnerId=${SEED_USERS[0].id}%2Cnone`,
    );
  });

  it("asks for custom fields first and omits empty filters", async () => {
    const calls = captureApiCalls("get", "/assets");

    await listAssetsWithCustomFields({
      filter: "web",
      assetType: [AssetType.Host],
      assetOwnerId: [],
    });
    await listAssets();

    expect(calls.map((call) => call.url.search)).toEqual([
      "?includeCustomFields=true&filter=web&assetType=host",
      "",
    ]);
  });
});

describe("asset api errors and replies", () => {
  it.each([
    ["list", "get", "/assets", () => listAssets()],
    ["get", "get", "/assets/:id", () => getAssetByID(asset.id)],
    ["create", "post", "/assets", () => createAsset({ displayName: "db", type: AssetType.Host })],
    ["update", "patch", "/assets/:id", () => updateAsset(asset.id, { displayName: "db" })],
    ["delete", "delete", "/assets/:id", () => deleteAsset(asset.id)],
    [
      "add identifier",
      "post",
      "/assets/:id/identifiers",
      () => addAssetIdentifier(asset.id, identifierInput),
    ],
    [
      "update identifier",
      "put",
      "/assets/:id/identifiers/:identifierId",
      () => updateAssetIdentifier(asset.id, identifier.id, identifierInput),
    ],
    [
      "delete identifier",
      "delete",
      "/assets/:id/identifiers/:identifierId",
      () => deleteAssetIdentifier(asset.id, identifier.id),
    ],
    [
      "list custom field values",
      "get",
      "/assets/:id/custom-fields",
      () => listAssetCustomFieldValues(asset.id),
    ],
    [
      "list available custom fields",
      "get",
      "/assets/:id/custom-fields/available",
      () => listAvailableAssetCustomFieldDefinitions(asset.id),
    ],
    [
      "update custom field values",
      "put",
      "/assets/:id/custom-fields",
      () => updateAssetCustomFieldValues(asset.id, []),
    ],
    [
      "replace custom field associations",
      "put",
      "/assets/:id/custom-fields/associations",
      () => replaceAssetCustomFieldAssociations(asset.id, []),
    ],
  ] as const)("turns %s error replies into APIErrors", async (_name, method, path, call) => {
    mockApiError(method, path, 422, "Asset endpoint rejected the request", "asset-reason");

    const request = call();
    await expect(request).rejects.toBeInstanceOf(APIError);
    await expect(request).rejects.toMatchObject({
      statusCode: 422,
      message: "Asset endpoint rejected the request",
      reason: "asset-reason",
    });
  });

  it.each([
    ["asset", "/assets", () => listAssets(), { items: [{ ...asset, type: "printer" }] }],
    [
      "custom field value",
      "/assets",
      () => listAssetsWithCustomFields(),
      { items: [{ ...SEED_ASSETS_WITH_CUSTOM_FIELDS[0], customFields: [{ fieldId: "x" }] }] },
    ],
  ] as const)("rejects replies that break the %s contract", async (_name, path, call, data) => {
    mockApiReply("get", path, { data });

    await expect(call()).rejects.toThrow();
  });

  it("rejects identifier replies that break the contract", async () => {
    mockApiReply("post", "/assets/:id/identifiers", { data: { ...identifier, type: "mac" } }, 201);

    await expect(addAssetIdentifier(asset.id, identifierInput)).rejects.toThrow();
  });
});
