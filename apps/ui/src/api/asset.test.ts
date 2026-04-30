import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  AssetCustomFieldType,
  AssetCustomFieldValueSource
} from "@openvlp/types/model/asset"
import {
  assignAssetCustomFields,
  clearAssetCustomFieldValue,
  createAssetCustomFieldValuesQueryOptions,
  createAvailableAssetCustomFieldDefinitionsQueryOptions,
  detachAssetCustomField,
  listAssetCustomFieldValues,
  listAvailableAssetCustomFieldDefinitions,
  updateAssetCustomFieldValues
} from "./asset.ts"
import type {
  AssetCustomFieldDefinition,
  AssetCustomFieldValue,
  UpdateAssetCustomFieldAssociations,
  UpdateAssetCustomFieldValues
} from "@openvlp/types/model/asset"

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
      `http://localhost:3001/api/assets/${assetId}/custom-fields`,
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
      `http://localhost:3001/api/assets/${assetId}/custom-fields/available`,
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
      `http://localhost:3001/api/assets/${assetId}/custom-fields`,
      expect.objectContaining({
        method: "PUT"
      })
    )
    expect(headers.get("Content-Type")).toBe("application/json")
    expect(requestJsonBody()).toEqual({
      values: valueUpdates
    })
  })

  it("assigns custom fields to an asset", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          items: values
        }
      })
    )

    await expect(
      assignAssetCustomFields(assetId, associationUpdates)
    ).resolves.toEqual(values)

    const headers = requestInit().headers as Headers

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:3001/api/assets/${assetId}/custom-fields/associations`,
      expect.objectContaining({
        method: "PUT"
      })
    )
    expect(headers.get("Content-Type")).toBe("application/json")
    expect(requestJsonBody()).toEqual({
      fieldIds: associationUpdates
    })
  })

  it("clears a custom field value for an asset", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          cleared: true
        }
      })
    )

    await expect(clearAssetCustomFieldValue(assetId, fieldId)).resolves.toEqual(
      {
        cleared: true
      }
    )

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:3001/api/assets/${assetId}/custom-fields/${fieldId}`,
      expect.objectContaining({
        method: "DELETE"
      })
    )
  })

  it("detaches a custom field from an asset", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          detached: true
        }
      })
    )

    await expect(detachAssetCustomField(assetId, fieldId)).resolves.toEqual({
      detached: true
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:3001/api/assets/${assetId}/custom-fields/associations/${fieldId}`,
      expect.objectContaining({
        method: "DELETE"
      })
    )
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

  it("creates query options for asset custom field values", () => {
    expect(createAssetCustomFieldValuesQueryOptions(assetId).queryKey).toEqual([
      "assets",
      assetId,
      "custom-fields"
    ])
  })

  it("creates query options for available asset custom field definitions", () => {
    expect(
      createAvailableAssetCustomFieldDefinitionsQueryOptions(assetId).queryKey
    ).toEqual(["assets", assetId, "custom-fields", "available"])
  })
})
