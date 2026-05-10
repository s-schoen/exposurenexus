import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AssetCustomFieldType } from "@exposurenexus/types/model/asset"
import { APIError } from "./common.ts"
import {
  createAssetCustomFieldDefinition,
  createAssetCustomFieldDefinitionByIDQueryOptions,
  createListAssetCustomFieldDefinitionsQueryOptions,
  deleteAssetCustomFieldDefinition,
  getAssetCustomFieldDefinitionByID,
  listAssetCustomFieldDefinitions,
  updateAssetCustomFieldDefinition
} from "./asset-custom-field.ts"
import type {
  AssetCustomFieldDefinition,
  UpdateAssetCustomFieldDefinition
} from "@exposurenexus/types/model/asset"

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

const definition: AssetCustomFieldDefinition = {
  id: "33d63e64-8f2b-4f88-b26f-fb090b4366ff",
  key: "environment",
  name: "Environment",
  required: false,
  type: AssetCustomFieldType.Select,
  defaultValue: "production",
  options: [
    {
      id: "f4b28e50-f8e1-42f8-a610-50b7a7f96d9d",
      fieldId: "33d63e64-8f2b-4f88-b26f-fb090b4366ff",
      value: "production",
      label: "Production"
    }
  ]
}

const payload: UpdateAssetCustomFieldDefinition = {
  key: "environment",
  name: "Environment",
  required: false,
  type: AssetCustomFieldType.Select,
  defaultValue: "production",
  options: [
    {
      value: "production",
      label: "Production"
    }
  ]
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("asset custom field api", () => {
  it("lists custom field definitions", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          items: [definition]
        }
      })
    )

    await expect(listAssetCustomFieldDefinitions()).resolves.toEqual([
      definition
    ])

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/assets/custom-fields",
      expect.objectContaining({
        method: "GET",
        credentials: "include"
      })
    )
  })

  it("gets a custom field definition by id", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: definition
      })
    )

    await expect(
      getAssetCustomFieldDefinitionByID(definition.id)
    ).resolves.toEqual(definition)

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/assets/custom-fields/${definition.id}`,
      expect.objectContaining({
        method: "GET"
      })
    )
  })

  it("creates a custom field definition", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: definition
      })
    )

    await expect(createAssetCustomFieldDefinition(payload)).resolves.toEqual(
      definition
    )

    const headers = requestInit().headers as Headers

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/assets/custom-fields",
      expect.objectContaining({
        method: "POST"
      })
    )
    expect(headers.get("Content-Type")).toBe("application/json")
    expect(requestJsonBody()).toEqual(payload)
  })

  it("updates a custom field definition", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: definition
      })
    )

    await expect(
      updateAssetCustomFieldDefinition(definition.id, payload)
    ).resolves.toEqual(definition)

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/assets/custom-fields/${definition.id}`,
      expect.objectContaining({
        method: "PUT"
      })
    )
    expect(requestJsonBody()).toEqual(payload)
  })

  it("deletes a custom field definition", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: definition
      })
    )

    await expect(
      deleteAssetCustomFieldDefinition(definition.id)
    ).resolves.toEqual(definition)

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/assets/custom-fields/${definition.id}`,
      expect.objectContaining({
        method: "DELETE"
      })
    )
  })

  it("throws api errors for failed requests", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          correlationId: "asset-custom-field-api-test",
          status: 409,
          error: "asset custom field definition already exists"
        },
        { status: 409 }
      )
    )

    try {
      await createAssetCustomFieldDefinition(payload)
      throw new Error("expected request to fail")
    } catch (error) {
      expect(error).toBeInstanceOf(APIError)
      expect(error).toMatchObject({
        statusCode: 409,
        message: "asset custom field definition already exists"
      })
    }
  })

  it("creates query options for custom field definitions", () => {
    expect(
      createListAssetCustomFieldDefinitionsQueryOptions().queryKey
    ).toEqual(["asset-custom-fields"])
    expect(
      createAssetCustomFieldDefinitionByIDQueryOptions(definition.id).queryKey
    ).toEqual(["asset-custom-fields", definition.id])
  })
})
