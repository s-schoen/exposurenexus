import {
  AssetEnvironment,
  AssetIdentifierType,
  AssetLifecycleState,
  AssetType,
} from "@exposurenexus/types/model/asset";
import {
  AssetCustomFieldType,
  AssetCustomFieldValueSource,
} from "@exposurenexus/types/model/asset-custom-field";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAsset,
  createAssetByIDQueryOptions,
  createAssetCustomFieldValuesQueryOptions,
  createAvailableAssetCustomFieldDefinitionsQueryOptions,
  createListAssetsQueryOptions,
  createListAssetsWithCustomFieldsQueryOptions,
  deleteAsset,
  addAssetIdentifier,
  deleteAssetIdentifier,
  listAssetCustomFieldValues,
  listAssetsWithCustomFields,
  listAvailableAssetCustomFieldDefinitions,
  replaceAssetCustomFieldAssociations,
  updateAssetCustomFieldValues,
  updateAssetIdentifier,
  updateAsset,
} from "@/api/asset.ts";

import type { Asset, AssetWithCustomFields, CreateAsset } from "@exposurenexus/types/model/asset";
import type {
  AssetCustomFieldDefinition,
  AssetCustomFieldValue,
  UpdateAssetCustomFieldAssociations,
  UpdateAssetCustomFieldValues,
} from "@exposurenexus/types/model/asset-custom-field";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: object, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });
}

function requestInit(): RequestInit {
  const init = fetchMock.mock.calls[0]?.[1];
  if (!init) {
    throw new Error("fetch was not called");
  }

  return init;
}

function requestJsonBody(): unknown {
  return JSON.parse(requestInit().body as string);
}

const assetId = "0bb9b410-7763-4e7a-9942-b752367fd63d";
const fieldId = "33d63e64-8f2b-4f88-b26f-fb090b4366ff";
const asset: Asset = {
  id: assetId,
  displayName: "api.exposurenexus.local",
  type: AssetType.Host,
  environment: AssetEnvironment.Production,
  lifecycleState: AssetLifecycleState.Active,
  ownerId: null,
  identifiers: [],
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  createdBy: "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
  updatedBy: "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
};
const identifier = {
  id: "f1c4c65c-4486-4a4d-b3fc-86f702390ba3",
  type: AssetIdentifierType.DnsName,
  namespace: null,
  value: "api.example.com",
} as const;
const definition: AssetCustomFieldDefinition = {
  id: fieldId,
  key: "deployment_tier",
  name: "Deployment tier",
  required: false,
  type: AssetCustomFieldType.Text,
  defaultValue: null,
};
const values: Array<AssetCustomFieldValue> = [
  {
    fieldId,
    key: "deployment_tier",
    name: "Deployment tier",
    source: AssetCustomFieldValueSource.Asset,
    type: AssetCustomFieldType.Text,
    value: "production",
  },
];
const assetsWithCustomFields: Array<AssetWithCustomFields> = [
  {
    ...asset,
    customFields: values,
  },
];
const createPayload: CreateAsset = {
  displayName: asset.displayName,
  type: asset.type,
  environment: asset.environment,
  lifecycleState: asset.lifecycleState,
  ownerId: asset.ownerId,
};
const associationUpdates: UpdateAssetCustomFieldAssociations["fieldIds"] = [fieldId];
const valueUpdates: UpdateAssetCustomFieldValues["values"] = [
  {
    fieldId,
    value: "production",
  },
];

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("asset custom field value api", () => {
  it("creates list query options and lists assets", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          items: [asset],
        },
      }),
    );

    const queryOptions = createListAssetsQueryOptions();
    const queryFn = queryOptions.queryFn as () => Promise<Array<Asset>>;
    const assets = await queryFn();

    expect(queryOptions.queryKey).toEqual(["assets"]);
    expect(assets).toEqual([asset]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/assets",
      expect.objectContaining({
        credentials: "include",
        method: "GET",
      }),
    );
  });

  it("sends inventory search and core filters to the asset list endpoint", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          items: [asset],
        },
      }),
    );

    const queryOptions = createListAssetsQueryOptions({
      filter: "api.example.com",
      assetType: [AssetType.Host, AssetType.Software],
      assetEnvironment: [AssetEnvironment.Production],
      assetLifecycleState: [AssetLifecycleState.Archived],
      assetOwnerId: ["f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d", "none"],
    });
    const queryFn = queryOptions.queryFn as () => Promise<Array<Asset>>;

    await expect(queryFn()).resolves.toEqual([asset]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/assets?filter=api.example.com&assetType=host%2Csoftware&assetEnvironment=production&assetLifecycleState=archived&assetOwnerId=f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d%2Cnone",
      expect.objectContaining({
        credentials: "include",
        method: "GET",
      }),
    );
    expect(queryOptions.queryKey).toEqual([
      "assets",
      "filter=api.example.com&assetType=host%2Csoftware&assetEnvironment=production&assetLifecycleState=archived&assetOwnerId=f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d%2Cnone",
    ]);
  });

  it("rejects malformed asset replies", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          items: [
            {
              ...asset,
              type: "database",
            },
          ],
        },
      }),
    );

    const queryOptions = createListAssetsQueryOptions();
    const queryFn = queryOptions.queryFn as () => Promise<Array<Asset>>;

    await expect(queryFn()).rejects.toThrow();
  });

  it("creates detail query options and gets assets by id", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: asset,
      }),
    );

    const queryOptions = createAssetByIDQueryOptions(assetId);
    const queryFn = queryOptions.queryFn as () => Promise<Asset>;
    const result = await queryFn();

    expect(queryOptions.queryKey).toEqual(["assets", assetId]);
    expect(result).toEqual(asset);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/assets/${assetId}`,
      expect.objectContaining({
        credentials: "include",
        method: "GET",
      }),
    );
  });

  it("creates assets with a JSON request body", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: asset,
      }),
    );

    await expect(createAsset(createPayload)).resolves.toEqual(asset);

    const headers = requestInit().headers as Headers;
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/assets",
      expect.objectContaining({
        credentials: "include",
        method: "POST",
      }),
    );
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(requestJsonBody()).toEqual({
      ...createPayload,
    });
  });

  it("creates assets with owner ids", async () => {
    const ownerId = "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d";
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          ...asset,
          ownerId,
        },
      }),
    );

    await expect(createAsset({ ...createPayload, ownerId })).resolves.toEqual({
      ...asset,
      ownerId,
    });

    expect(requestJsonBody()).toEqual({
      ...createPayload,
      ownerId,
    });
  });

  it("updates all asset core metadata in one JSON request", async () => {
    const ownerId = "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d";
    const update = {
      displayName: "api-production",
      type: AssetType.Software,
      environment: AssetEnvironment.Staging,
      lifecycleState: AssetLifecycleState.Archived,
      ownerId,
    } as const;
    const updatedAsset = {
      ...asset,
      ...update,
    };

    fetchMock.mockResolvedValueOnce(jsonResponse({ data: updatedAsset }));

    await expect(updateAsset(asset.id, update)).resolves.toEqual(updatedAsset);

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/assets/${asset.id}`,
      expect.objectContaining({
        credentials: "include",
        method: "PATCH",
      }),
    );
    expect(requestJsonBody()).toEqual(update);
  });

  it("clears asset owners", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: asset }));

    await expect(updateAsset(asset.id, { ownerId: null })).resolves.toEqual(asset);

    expect(requestJsonBody()).toEqual({ ownerId: null });
  });

  it("adds, updates, and deletes asset identifiers", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: identifier }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            ...identifier,
            namespace: "private-network",
            value: "api.internal.example.com",
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: identifier }));

    await expect(
      addAssetIdentifier(assetId, {
        type: AssetIdentifierType.DnsName,
        value: "api.example.com",
      }),
    ).resolves.toEqual(identifier);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `/api/assets/${assetId}/identifiers`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      type: AssetIdentifierType.DnsName,
      value: "api.example.com",
    });

    await expect(
      updateAssetIdentifier(assetId, identifier.id, {
        type: AssetIdentifierType.DnsName,
        namespace: "private-network",
        value: "api.internal.example.com",
      }),
    ).resolves.toMatchObject({ value: "api.internal.example.com" });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `/api/assets/${assetId}/identifiers/${identifier.id}`,
      expect.objectContaining({ method: "PUT" }),
    );
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)).toEqual({
      type: AssetIdentifierType.DnsName,
      namespace: "private-network",
      value: "api.internal.example.com",
    });

    await expect(deleteAssetIdentifier(assetId, identifier.id)).resolves.toEqual(identifier);
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `/api/assets/${assetId}/identifiers/${identifier.id}`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("rejects malformed asset identifier replies", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          ...identifier,
          id: "not-a-uuid",
        },
      }),
    );

    await expect(
      addAssetIdentifier(assetId, {
        type: AssetIdentifierType.DnsName,
        value: identifier.value,
      }),
    ).rejects.toThrow();
  });

  it("deletes assets", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: asset,
      }),
    );

    await expect(deleteAsset(assetId)).resolves.toEqual(asset);

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/assets/${assetId}`,
      expect.objectContaining({
        credentials: "include",
        method: "DELETE",
      }),
    );
  });

  it("lists assets with custom field values", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          items: assetsWithCustomFields,
        },
      }),
    );

    await expect(listAssetsWithCustomFields()).resolves.toEqual(assetsWithCustomFields);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/assets?includeCustomFields=true",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      }),
    );
  });

  it("sends filters when listing assets with custom field values", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          items: assetsWithCustomFields,
        },
      }),
    );

    await expect(
      listAssetsWithCustomFields({
        filter: "api.example.com",
        assetType: [AssetType.Host],
      }),
    ).resolves.toEqual(assetsWithCustomFields);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/assets?includeCustomFields=true&filter=api.example.com&assetType=host",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      }),
    );
  });

  it("creates filtered query options for assets with custom field values", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          items: assetsWithCustomFields,
        },
      }),
    );

    const queryOptions = createListAssetsWithCustomFieldsQueryOptions({
      filter: "api.example.com",
      assetEnvironment: [AssetEnvironment.Production],
    });
    const queryFn = queryOptions.queryFn as () => Promise<Array<AssetWithCustomFields>>;

    await expect(queryFn()).resolves.toEqual(assetsWithCustomFields);
    expect(queryOptions.queryKey).toEqual([
      "assets",
      "with-custom-fields",
      "filter=api.example.com&assetEnvironment=production",
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/assets?includeCustomFields=true&filter=api.example.com&assetEnvironment=production",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("rejects malformed asset custom field value replies", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          items: [
            {
              ...values[0],
              fieldId: "not-a-uuid",
            },
          ],
        },
      }),
    );

    await expect(listAssetCustomFieldValues(assetId)).rejects.toThrow();
  });

  it("lists custom field values for an asset", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          items: values,
        },
      }),
    );

    await expect(listAssetCustomFieldValues(assetId)).resolves.toEqual(values);

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/assets/${assetId}/custom-fields`,
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      }),
    );
  });

  it("lists available custom field definitions for an asset", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          items: [definition],
        },
      }),
    );

    await expect(listAvailableAssetCustomFieldDefinitions(assetId)).resolves.toEqual([definition]);

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/assets/${assetId}/custom-fields/available`,
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      }),
    );
  });

  it("updates custom field values for an asset", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          items: values,
        },
      }),
    );

    await expect(updateAssetCustomFieldValues(assetId, valueUpdates)).resolves.toEqual(values);

    const headers = requestInit().headers as Headers;

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/assets/${assetId}/custom-fields`,
      expect.objectContaining({
        method: "PUT",
      }),
    );
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(requestJsonBody()).toEqual({
      values: valueUpdates,
    });
  });

  it("replaces custom field associations for an asset", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          items: values,
        },
      }),
    );

    await expect(replaceAssetCustomFieldAssociations(assetId, associationUpdates)).resolves.toEqual(
      values,
    );

    const headers = requestInit().headers as Headers;

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/assets/${assetId}/custom-fields/associations`,
      expect.objectContaining({
        method: "PUT",
      }),
    );
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(requestJsonBody()).toEqual({
      fieldIds: associationUpdates,
    });
  });

  it("throws api errors for failed value updates", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          correlationId: "asset-custom-field-values-api-test",
          status: 400,
          error: "invalid value for asset custom field environment",
        },
        { status: 400 },
      ),
    );

    await expect(updateAssetCustomFieldValues(assetId, valueUpdates)).rejects.toMatchObject({
      statusCode: 400,
      message: "invalid value for asset custom field environment",
    });
  });

  it("throws api errors for failed asset requests", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: "Asset request failed",
          reason: "not found",
        },
        { status: 404 },
      ),
    );

    await expect(deleteAsset(assetId)).rejects.toThrow("Asset request failed");
  });

  it("creates query options for asset custom field values", () => {
    expect(createAssetCustomFieldValuesQueryOptions(assetId).queryKey).toEqual([
      "assets",
      assetId,
      "custom-fields",
    ]);
  });

  it("creates query options for assets with custom field values", () => {
    expect(createListAssetsWithCustomFieldsQueryOptions().queryKey).toEqual([
      "assets",
      "with-custom-fields",
    ]);
  });

  it("creates query options for available asset custom field definitions", () => {
    expect(createAvailableAssetCustomFieldDefinitionsQueryOptions(assetId).queryKey).toEqual([
      "assets",
      assetId,
      "custom-fields",
      "available",
    ]);
  });
});
