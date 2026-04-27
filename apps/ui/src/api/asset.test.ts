import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  AssetCustomFieldType,
  AssetCustomFieldValueSource
} from "@openvlp/types/model/asset"
import {
  clearAssetCustomFieldValue,
  createAssetCustomFieldValuesQueryOptions,
  listAssetCustomFieldValues,
  updateAssetCustomFieldValues
} from "./asset.ts"
import type {
  AssetCustomFieldValue,
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
})
