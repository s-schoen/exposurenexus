import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AssetType } from "@exposurenexus/types/model/asset"
import {
  AssetCustomFieldType,
  AssetCustomFieldValueSource
} from "@exposurenexus/types/model/asset-custom-field"
import {
  createAsset,
  createAssetByIDQueryOptions,
  createAssetCustomFieldValuesQueryOptions,
  createAvailableAssetCustomFieldDefinitionsQueryOptions,
  createListAssetsQueryOptions,
  createListAssetsWithCustomFieldsQueryOptions,
  deleteAsset,
  listAssetCustomFieldValues,
  listAssetsWithCustomFields,
  listAvailableAssetCustomFieldDefinitions,
  replaceAssetCustomFieldAssociations,
  updateAssetCustomFieldValues,
  updateAssetOwner
} from "./asset.ts"
import type {
  Asset,
  AssetWithCustomFields
} from "@exposurenexus/types/model/asset"
import type {
  AssetCustomFieldDefinition,
  AssetCustomFieldValue,
  UpdateAssetCustomFieldAssociations,
  UpdateAssetCustomFieldValues
} from "@exposurenexus/types/model/asset-custom-field"

const fetchMock = vi.fn<typeof fetch>()

function jsonResponse(body: object, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  })
}

function requestInit(): RequestInit {
  const init = fetchMock.mock.calls[0]?.[1]
  if (!init) {
    throw new Error("fetch was not called")
  }

  return init
}

function requestJsonBody(): unknown {
  return JSON.parse(requestInit().body as string)
}

const assetId = "0bb9b410-7763-4e7a-9942-b752367fd63d"
const fieldId = "33d63e64-8f2b-4f88-b26f-fb090b4366ff"
const asset: Asset = {
  id: assetId,
  name: "api.exposurenexus.local",
  type: AssetType.Host,
  ownerId: null
}
const definition: AssetCustomFieldDefinition = {
  id: fieldId,
  key: "environment",
  name: "Environment",
  required: false,
  type: AssetCustomFieldType.Text,
  defaultValue: null
}
const values: Array<AssetCustomFieldValue> = [
  {
    fieldId,
    key: "environment",
    name: "Environment",
    source: AssetCustomFieldValueSource.Asset,
    type: AssetCustomFieldType.Text,
    value: "production"
  }
]
const assetsWithCustomFields: Array<AssetWithCustomFields> = [
  {
    id: assetId,
    name: "api.exposurenexus.local",
    type: AssetType.Host,
    ownerId: null,
    customFields: values
  }
]
const associationUpdates: UpdateAssetCustomFieldAssociations["fieldIds"] = [
  fieldId
]
const valueUpdates: UpdateAssetCustomFieldValues["values"] = [
  {
    fieldId,
    value: "production"
  }
]

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("asset custom field value api", () => {
  it("creates list query options and lists assets", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          items: [asset]
        }
      })
    )

    const queryOptions = createListAssetsQueryOptions()
    const queryFn = queryOptions.queryFn as () => Promise<Array<Asset>>
    const assets = await queryFn()

    expect(queryOptions.queryKey).toEqual(["assets"])
    expect(assets).toEqual([asset])
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/assets",
      expect.objectContaining({
        credentials: "include",
        method: "GET"
      })
    )
  })

  it("rejects malformed asset replies", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          items: [
            {
              ...asset,
              type: "database"
            }
          ]
        }
      })
    )

    const queryOptions = createListAssetsQueryOptions()
    const queryFn = queryOptions.queryFn as () => Promise<Array<Asset>>

    await expect(queryFn()).rejects.toThrow()
  })

  it("creates detail query options and gets assets by id", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: asset
      })
    )

    const queryOptions = createAssetByIDQueryOptions(assetId)
    const queryFn = queryOptions.queryFn as () => Promise<Asset>
    const result = await queryFn()

    expect(queryOptions.queryKey).toEqual(["asset", assetId])
    expect(result).toEqual(asset)
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/assets/${assetId}`,
      expect.objectContaining({
        credentials: "include",
        method: "GET"
      })
    )
  })

  it("creates assets with a JSON request body", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: asset
      })
    )

    await expect(
      createAsset(asset.name, asset.type, asset.ownerId)
    ).resolves.toEqual(asset)

    const headers = requestInit().headers as Headers
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/assets",
      expect.objectContaining({
        credentials: "include",
        method: "POST"
      })
    )
    expect(headers.get("Content-Type")).toBe("application/json")
    expect(requestJsonBody()).toEqual({
      name: asset.name,
      type: asset.type,
      ownerId: asset.ownerId
    })
  })

  it("creates assets with owner ids", async () => {
    const ownerId = "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d"
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          ...asset,
          ownerId
        }
      })
    )

    await expect(createAsset(asset.name, asset.type, ownerId)).resolves.toEqual(
      {
        ...asset,
        ownerId
      }
    )

    expect(requestJsonBody()).toEqual({
      name: asset.name,
      type: asset.type,
      ownerId
    })
  })

  it("updates asset owners", async () => {
    const ownerId = "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d"
    const updatedAsset = {
      ...asset,
      ownerId
    }

    fetchMock.mockResolvedValueOnce(jsonResponse({ data: updatedAsset }))

    await expect(updateAssetOwner(asset.id, ownerId)).resolves.toEqual(
      updatedAsset
    )

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/assets/${asset.id}/owner`,
      expect.objectContaining({
        credentials: "include",
        method: "PUT"
      })
    )
    expect(requestJsonBody()).toEqual({ ownerId })
  })

  it("clears asset owners", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: asset }))

    await expect(updateAssetOwner(asset.id, null)).resolves.toEqual(asset)

    expect(requestJsonBody()).toEqual({ ownerId: null })
  })

  it("deletes assets", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: asset
      })
    )

    await expect(deleteAsset(assetId)).resolves.toEqual(asset)

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/assets/${assetId}`,
      expect.objectContaining({
        credentials: "include",
        method: "DELETE"
      })
    )
  })

  it("lists assets with custom field values", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          items: assetsWithCustomFields
        }
      })
    )

    await expect(listAssetsWithCustomFields()).resolves.toEqual(
      assetsWithCustomFields
    )

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/assets?includeCustomFields=true",
      expect.objectContaining({
        method: "GET",
        credentials: "include"
      })
    )
  })

  it("rejects malformed asset custom field value replies", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          items: [
            {
              ...values[0],
              fieldId: "not-a-uuid"
            }
          ]
        }
      })
    )

    await expect(listAssetCustomFieldValues(assetId)).rejects.toThrow()
  })

  it("lists custom field values for an asset", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          items: values
        }
      })
    )

    await expect(listAssetCustomFieldValues(assetId)).resolves.toEqual(values)

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/assets/${assetId}/custom-fields`,
      expect.objectContaining({
        method: "GET",
        credentials: "include"
      })
    )
  })

  it("lists available custom field definitions for an asset", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          items: [definition]
        }
      })
    )

    await expect(
      listAvailableAssetCustomFieldDefinitions(assetId)
    ).resolves.toEqual([definition])

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/assets/${assetId}/custom-fields/available`,
      expect.objectContaining({
        method: "GET",
        credentials: "include"
      })
    )
  })

  it("updates custom field values for an asset", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          items: values
        }
      })
    )

    await expect(
      updateAssetCustomFieldValues(assetId, valueUpdates)
    ).resolves.toEqual(values)

    const headers = requestInit().headers as Headers

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/assets/${assetId}/custom-fields`,
      expect.objectContaining({
        method: "PUT"
      })
    )
    expect(headers.get("Content-Type")).toBe("application/json")
    expect(requestJsonBody()).toEqual({
      values: valueUpdates
    })
  })

  it("replaces custom field associations for an asset", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          items: values
        }
      })
    )

    await expect(
      replaceAssetCustomFieldAssociations(assetId, associationUpdates)
    ).resolves.toEqual(values)

    const headers = requestInit().headers as Headers

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/assets/${assetId}/custom-fields/associations`,
      expect.objectContaining({
        method: "PUT"
      })
    )
    expect(headers.get("Content-Type")).toBe("application/json")
    expect(requestJsonBody()).toEqual({
      fieldIds: associationUpdates
    })
  })

  it("throws api errors for failed value updates", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          correlationId: "asset-custom-field-values-api-test",
          status: 400,
          error: "invalid value for asset custom field environment"
        },
        { status: 400 }
      )
    )

    await expect(
      updateAssetCustomFieldValues(assetId, valueUpdates)
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "invalid value for asset custom field environment"
    })
  })

  it("throws api errors for failed asset requests", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: "Asset request failed",
          reason: "not found"
        },
        { status: 404 }
      )
    )

    await expect(deleteAsset(assetId)).rejects.toThrow("Asset request failed")
  })

  it("creates query options for asset custom field values", () => {
    expect(createAssetCustomFieldValuesQueryOptions(assetId).queryKey).toEqual([
      "assets",
      assetId,
      "custom-fields"
    ])
  })

  it("creates query options for assets with custom field values", () => {
    expect(createListAssetsWithCustomFieldsQueryOptions().queryKey).toEqual([
      "assets",
      "with-custom-fields"
    ])
  })

  it("creates query options for available asset custom field definitions", () => {
    expect(
      createAvailableAssetCustomFieldDefinitionsQueryOptions(assetId).queryKey
    ).toEqual(["assets", assetId, "custom-fields", "available"])
  })
})
