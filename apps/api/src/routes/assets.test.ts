import { beforeEach, describe, expect, it, vi } from "vitest"
import { HTTPException } from "hono/http-exception"
import {
  AssetCustomFieldRuleViolationReason,
  AssetCustomFieldType,
  AssetCustomFieldValueSource,
  AssetType
} from "@exposurenexus/types/model/asset"
import {
  annotateAuthenticatedUser,
  createTestApp,
  createTestUser,
  requireAuthenticatedUser
} from "../test/app.js"
import { createRequireDomainPermission } from "../middleware/auth.js"
import { createAssetRoute } from "./assets.js"

describe("asset routes", () => {
  const user = createTestUser()
  const userHasPermission = vi.fn()
  const routeDependencies = {
    requireDomainPermission: createRequireDomainPermission(userHasPermission)
  }
  const assetService = {
    listAll: vi.fn(),
    listAllWithCustomFields: vi.fn(),
    getByID: vi.fn(),
    create: vi.fn(),
    updateOwnerByID: vi.fn(),
    deleteByID: vi.fn(),
    listCustomFieldDefinitions: vi.fn(),
    getCustomFieldDefinitionByID: vi.fn(),
    createCustomFieldDefinition: vi.fn(),
    updateCustomFieldDefinitionByID: vi.fn(),
    deleteCustomFieldDefinitionByID: vi.fn(),
    listCustomFieldValues: vi.fn(),
    listAvailableCustomFieldDefinitions: vi.fn(),
    upsertCustomFieldValues: vi.fn(),
    clearCustomFieldValue: vi.fn(),
    assignCustomFields: vi.fn(),
    detachCustomField: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    userHasPermission.mockResolvedValue(true)
  })

  it("returns 401 for unauthenticated requests", async () => {
    const requestId = "assets-unauthorized-request"
    const app = createTestApp({
      assetRoute: createAssetRoute(assetService, routeDependencies),
      requireAuth: requireAuthenticatedUser
    })

    const response = await app.request("/api/assets", {
      headers: {
        "X-Request-Id": requestId
      }
    })
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({
      correlationId: requestId,
      status: 401,
      error: "Unauthorized"
    })
    expect(assetService.listAll).not.toHaveBeenCalled()
  })

  it("returns all assets for authenticated requests", async () => {
    const requestId = "assets-list-request"
    const assets = [
      {
        id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
        name: "api.exposurenexus.local",
        type: AssetType.Host,
        ownerId: null
      }
    ]

    assetService.listAll.mockResolvedValue(assets)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request("/api/assets", {
      headers: {
        "X-Request-Id": requestId
      }
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(assetService.listAll).toHaveBeenCalledOnce()
    expect(assetService.listAllWithCustomFields).not.toHaveBeenCalled()
    expect(body).toEqual({
      correlationId: requestId,
      data: {
        items: assets,
        totalItems: 1,
        startIndex: 0,
        currentItemCount: 1
      }
    })
  })

  it("returns assets with custom field values when requested", async () => {
    const requestId = "assets-list-with-custom-fields-request"
    const assets = [
      {
        id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
        name: "api.exposurenexus.local",
        type: AssetType.Host,
        ownerId: null,
        customFields: [
          {
            fieldId: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
            key: "category",
            name: "Category",
            source: AssetCustomFieldValueSource.Default,
            type: AssetCustomFieldType.Text,
            value: "platform"
          }
        ]
      }
    ]

    assetService.listAllWithCustomFields.mockResolvedValue(assets)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request("/api/assets?includeCustomFields=true", {
      headers: {
        "X-Request-Id": requestId
      }
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(assetService.listAll).not.toHaveBeenCalled()
    expect(assetService.listAllWithCustomFields).toHaveBeenCalledOnce()
    expect(body).toEqual({
      correlationId: requestId,
      data: {
        items: assets,
        totalItems: 1,
        startIndex: 0,
        currentItemCount: 1
      }
    })
  })

  it("returns plain assets when custom field values are explicitly disabled", async () => {
    const requestId = "assets-list-with-custom-fields-disabled-request"
    const assets = [
      {
        id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
        name: "api.exposurenexus.local",
        type: AssetType.Host,
        ownerId: null
      }
    ]

    assetService.listAll.mockResolvedValue(assets)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request(
      "/api/assets?includeCustomFields=false",
      {
        headers: {
          "X-Request-Id": requestId
        }
      }
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(assetService.listAll).toHaveBeenCalledOnce()
    expect(assetService.listAllWithCustomFields).not.toHaveBeenCalled()
    expect(body).toEqual({
      correlationId: requestId,
      data: {
        items: assets,
        totalItems: 1,
        startIndex: 0,
        currentItemCount: 1
      }
    })
  })

  it("rejects invalid asset ids before calling the service", async () => {
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request("/api/assets/not-a-uuid", {
      headers: {
        "X-Request-Id": "assets-invalid-id-request"
      }
    })

    expect(response.status).toBe(400)
    expect(assetService.getByID).not.toHaveBeenCalled()
  })

  it("returns asset custom field definitions", async () => {
    const requestId = "assets-custom-fields-list-request"
    const definitions = [
      {
        id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
        key: "category",
        name: "Category",
        required: false,
        type: AssetCustomFieldType.Text,
        defaultValue: null
      }
    ]

    assetService.listCustomFieldDefinitions.mockResolvedValue(definitions)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request("/api/assets/custom-fields", {
      headers: {
        "X-Request-Id": requestId
      }
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(assetService.listCustomFieldDefinitions).toHaveBeenCalledOnce()
    expect(assetService.getByID).not.toHaveBeenCalled()
    expect(body).toEqual({
      correlationId: requestId,
      data: {
        items: definitions,
        totalItems: 1,
        startIndex: 0,
        currentItemCount: 1
      }
    })
  })

  it("returns an asset custom field definition by id", async () => {
    const requestId = "assets-custom-fields-get-request"
    const definition = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: null
    }

    assetService.getCustomFieldDefinitionByID.mockResolvedValue(definition)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request(
      `/api/assets/custom-fields/${definition.id}`,
      {
        headers: {
          "X-Request-Id": requestId
        }
      }
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(assetService.getCustomFieldDefinitionByID).toHaveBeenCalledWith(
      definition.id
    )
    expect(body).toEqual({
      correlationId: requestId,
      data: definition
    })
  })

  it("rejects invalid asset custom field ids before calling the service", async () => {
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request("/api/assets/custom-fields/not-a-uuid", {
      headers: {
        "X-Request-Id": "assets-custom-fields-invalid-id-request"
      }
    })

    expect(response.status).toBe(400)
    expect(assetService.getCustomFieldDefinitionByID).not.toHaveBeenCalled()
  })

  it("returns 404 when the asset custom field definition does not exist", async () => {
    const requestId = "assets-custom-fields-not-found-request"
    const fieldId = "5bde818a-bb4f-4a0f-a5eb-a190d5142a25"

    assetService.getCustomFieldDefinitionByID.mockResolvedValue(null)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request(`/api/assets/custom-fields/${fieldId}`, {
      headers: {
        "X-Request-Id": requestId
      }
    })
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(assetService.getCustomFieldDefinitionByID).toHaveBeenCalledWith(
      fieldId
    )
    expect(body).toEqual({
      correlationId: requestId,
      status: 404,
      error: `asset custom field with id ${fieldId} does not exist`
    })
  })

  it("returns 201 when creating an asset custom field definition", async () => {
    const requestId = "assets-custom-fields-create-request"
    const payload = {
      key: "environment",
      name: "Environment",
      required: true,
      type: AssetCustomFieldType.Select,
      defaultValue: "prod",
      options: [
        { value: "prod", label: "Production" },
        { value: "stage", label: "Staging" }
      ]
    }
    const created = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      ...payload,
      options: payload.options.map((option, index) => ({
        id:
          index === 0
            ? "2db67190-9d84-482f-9936-cfbf4244752b"
            : "f1c4c65c-4486-4a4d-b3fc-86f702390ba3",
        fieldId: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
        ...option
      }))
    }

    assetService.createCustomFieldDefinition.mockResolvedValue(created)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request("/api/assets/custom-fields", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId
      },
      body: JSON.stringify(payload)
    })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(assetService.createCustomFieldDefinition).toHaveBeenCalledWith({
      definition: payload,
      eventContext: {
        actor: user.id,
        correlationId: requestId
      }
    })
    expect(body).toEqual({
      correlationId: requestId,
      data: created
    })
  })

  it("rejects invalid asset custom field create bodies before calling the service", async () => {
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request("/api/assets/custom-fields", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "assets-custom-fields-invalid-create-body-request"
      },
      body: JSON.stringify({
        key: "environment",
        name: "Environment",
        required: false,
        type: AssetCustomFieldType.Select,
        defaultValue: null,
        options: []
      })
    })

    expect(response.status).toBe(400)
    expect(assetService.createCustomFieldDefinition).not.toHaveBeenCalled()
  })

  it("returns custom field rule reasons for create validation failures", async () => {
    const requestId = "assets-custom-fields-create-rule-failure-request"
    const payload = {
      key: "category",
      name: "Category",
      required: true,
      type: AssetCustomFieldType.Text,
      defaultValue: null
    }
    const violation = {
      reason: AssetCustomFieldRuleViolationReason.RequiredDefaultMissing,
      path: ["defaultValue"]
    }

    assetService.createCustomFieldDefinition.mockRejectedValue(
      new HTTPException(400, {
        message: "required custom fields must define a default value",
        cause: violation
      })
    )

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request("/api/assets/custom-fields", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId
      },
      body: JSON.stringify(payload)
    })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(assetService.createCustomFieldDefinition).toHaveBeenCalledWith({
      definition: payload,
      eventContext: {
        actor: user.id,
        correlationId: requestId
      }
    })
    expect(body).toEqual({
      correlationId: requestId,
      status: 400,
      error: "required custom fields must define a default value",
      reason: AssetCustomFieldRuleViolationReason.RequiredDefaultMissing
    })
  })

  it("passes non-rule custom field create errors to the error handler", async () => {
    const requestId = "assets-custom-fields-create-non-rule-failure-request"
    const payload = {
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: null
    }

    assetService.createCustomFieldDefinition.mockRejectedValueOnce(
      new HTTPException(400, {
        message: "invalid custom field definition"
      })
    )

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request("/api/assets/custom-fields", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId
      },
      body: JSON.stringify(payload)
    })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({
      correlationId: requestId,
      status: 400,
      error: "invalid custom field definition"
    })
  })

  it("updates an asset custom field definition", async () => {
    const requestId = "assets-custom-fields-update-request"
    const fieldId = "5bde818a-bb4f-4a0f-a5eb-a190d5142a25"
    const payload = {
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: "platform"
    }
    const updated = {
      id: fieldId,
      ...payload
    }

    assetService.updateCustomFieldDefinitionByID.mockResolvedValue(updated)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request(`/api/assets/custom-fields/${fieldId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId
      },
      body: JSON.stringify(payload)
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(assetService.updateCustomFieldDefinitionByID).toHaveBeenCalledWith({
      id: fieldId,
      definition: payload,
      eventContext: {
        actor: user.id,
        correlationId: requestId
      }
    })
    expect(body).toEqual({
      correlationId: requestId,
      data: updated
    })
  })

  it("returns 404 when updating a missing asset custom field definition", async () => {
    const requestId = "assets-custom-fields-update-not-found-request"
    const fieldId = "5bde818a-bb4f-4a0f-a5eb-a190d5142a25"
    const payload = {
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: "platform"
    }

    assetService.updateCustomFieldDefinitionByID.mockResolvedValueOnce(null)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request(`/api/assets/custom-fields/${fieldId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId
      },
      body: JSON.stringify(payload)
    })
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(assetService.updateCustomFieldDefinitionByID).toHaveBeenCalledWith({
      id: fieldId,
      definition: payload,
      eventContext: {
        actor: user.id,
        correlationId: requestId
      }
    })
    expect(body).toEqual({
      correlationId: requestId,
      status: 404,
      error: `asset custom field with id ${fieldId} does not exist`
    })
  })

  it("returns custom field rule reasons for update validation failures", async () => {
    const requestId = "assets-custom-fields-update-rule-failure-request"
    const fieldId = "5bde818a-bb4f-4a0f-a5eb-a190d5142a25"
    const payload = {
      key: "environment",
      name: "Environment",
      required: false,
      type: AssetCustomFieldType.Select,
      defaultValue: "dev",
      options: [{ value: "prod", label: "Production" }]
    }
    const violation = {
      reason: AssetCustomFieldRuleViolationReason.SelectDefaultMustMatchOption,
      path: ["defaultValue"]
    }

    assetService.updateCustomFieldDefinitionByID.mockRejectedValue(
      new HTTPException(400, {
        message: "select custom field default must match an option value",
        cause: violation
      })
    )

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request(`/api/assets/custom-fields/${fieldId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId
      },
      body: JSON.stringify(payload)
    })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(assetService.updateCustomFieldDefinitionByID).toHaveBeenCalledWith({
      id: fieldId,
      definition: payload,
      eventContext: {
        actor: user.id,
        correlationId: requestId
      }
    })
    expect(body).toEqual({
      correlationId: requestId,
      status: 400,
      error: "select custom field default must match an option value",
      reason: AssetCustomFieldRuleViolationReason.SelectDefaultMustMatchOption
    })
  })

  it("passes non-rule custom field update errors to the error handler", async () => {
    const requestId = "assets-custom-fields-update-non-rule-failure-request"
    const fieldId = "5bde818a-bb4f-4a0f-a5eb-a190d5142a25"
    const payload = {
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: "platform"
    }

    assetService.updateCustomFieldDefinitionByID.mockRejectedValueOnce(
      new HTTPException(400, {
        message: "invalid custom field definition",
        cause: { reason: "unknown-rule" }
      })
    )

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request(`/api/assets/custom-fields/${fieldId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId
      },
      body: JSON.stringify(payload)
    })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({
      correlationId: requestId,
      status: 400,
      error: "invalid custom field definition"
    })
  })

  it("deletes an asset custom field definition", async () => {
    const requestId = "assets-custom-fields-delete-request"
    const definition = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: null
    }

    assetService.deleteCustomFieldDefinitionByID.mockResolvedValue(definition)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request(
      `/api/assets/custom-fields/${definition.id}`,
      {
        method: "DELETE",
        headers: {
          "X-Request-Id": requestId
        }
      }
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(assetService.deleteCustomFieldDefinitionByID).toHaveBeenCalledWith({
      id: definition.id,
      eventContext: {
        actor: user.id,
        correlationId: requestId
      }
    })
    expect(body).toEqual({
      correlationId: requestId,
      data: definition
    })
  })

  it("returns 404 when deleting a missing asset custom field definition", async () => {
    const requestId = "assets-custom-fields-delete-not-found-request"
    const fieldId = "5bde818a-bb4f-4a0f-a5eb-a190d5142a25"

    assetService.deleteCustomFieldDefinitionByID.mockResolvedValueOnce(null)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request(`/api/assets/custom-fields/${fieldId}`, {
      method: "DELETE",
      headers: {
        "X-Request-Id": requestId
      }
    })
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(assetService.deleteCustomFieldDefinitionByID).toHaveBeenCalledWith({
      id: fieldId,
      eventContext: {
        actor: user.id,
        correlationId: requestId
      }
    })
    expect(body).toEqual({
      correlationId: requestId,
      status: 404,
      error: `asset custom field with id ${fieldId} does not exist`
    })
  })

  it("returns 403 when creating a custom field without write permission", async () => {
    userHasPermission.mockResolvedValue(false)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request("/api/assets/custom-fields", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "assets-custom-fields-create-forbidden-request"
      },
      body: JSON.stringify({
        key: "category",
        name: "Category",
        required: false,
        type: AssetCustomFieldType.Text,
        defaultValue: null
      })
    })

    expect(response.status).toBe(403)
    expect(userHasPermission).toHaveBeenCalledWith(user.id, {
      "custom-field": ["write"]
    })
    expect(assetService.createCustomFieldDefinition).not.toHaveBeenCalled()
  })

  it("returns 404 when the asset does not exist", async () => {
    const requestId = "assets-not-found-request"
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"

    assetService.getByID.mockResolvedValue(null)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request(`/api/assets/${assetId}`, {
      headers: {
        "X-Request-Id": requestId
      }
    })
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(assetService.getByID).toHaveBeenCalledWith(assetId)
    expect(body).toEqual({
      correlationId: requestId,
      status: 404,
      error: `asset with id ${assetId} does not exist`
    })
  })

  it("returns an asset by id", async () => {
    const requestId = "assets-get-by-id-request"
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"
    const assetRecord = {
      id: assetId,
      name: "api.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null
    }

    assetService.getByID.mockResolvedValue(assetRecord)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request(`/api/assets/${assetId}`, {
      headers: {
        "X-Request-Id": requestId
      }
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(assetService.getByID).toHaveBeenCalledWith(assetId)
    expect(body).toEqual({
      correlationId: requestId,
      data: assetRecord
    })
  })

  it("returns asset custom field values", async () => {
    const requestId = "assets-custom-field-values-list-request"
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"
    const values = [
      {
        fieldId: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
        key: "category",
        name: "Category",
        source: AssetCustomFieldValueSource.Default,
        type: AssetCustomFieldType.Text,
        value: "platform"
      }
    ]

    assetService.listCustomFieldValues.mockResolvedValue(values)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request(`/api/assets/${assetId}/custom-fields`, {
      headers: {
        "X-Request-Id": requestId
      }
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(assetService.listCustomFieldValues).toHaveBeenCalledWith(assetId)
    expect(assetService.getByID).not.toHaveBeenCalled()
    expect(body).toEqual({
      correlationId: requestId,
      data: {
        items: values,
        totalItems: 1,
        startIndex: 0,
        currentItemCount: 1
      }
    })
  })

  it("returns custom field definitions available for an asset", async () => {
    const requestId = "assets-custom-field-values-available-request"
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"
    const definitions = [
      {
        id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
        key: "category",
        name: "Category",
        required: false,
        type: AssetCustomFieldType.Text,
        defaultValue: null
      }
    ]

    assetService.listAvailableCustomFieldDefinitions.mockResolvedValue(
      definitions
    )

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request(
      `/api/assets/${assetId}/custom-fields/available`,
      {
        headers: {
          "X-Request-Id": requestId
        }
      }
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(
      assetService.listAvailableCustomFieldDefinitions
    ).toHaveBeenCalledWith(assetId)
    expect(body).toEqual({
      correlationId: requestId,
      data: {
        items: definitions,
        totalItems: 1,
        startIndex: 0,
        currentItemCount: 1
      }
    })
  })

  it("returns 404 when listing custom field values for a missing asset", async () => {
    const requestId = "assets-custom-field-values-list-missing-asset-request"
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"

    assetService.listCustomFieldValues.mockResolvedValue(null)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request(`/api/assets/${assetId}/custom-fields`, {
      headers: {
        "X-Request-Id": requestId
      }
    })
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(assetService.listCustomFieldValues).toHaveBeenCalledWith(assetId)
    expect(body).toEqual({
      correlationId: requestId,
      status: 404,
      error: `asset with id ${assetId} does not exist`
    })
  })

  it("rejects invalid asset ids for custom field values before calling the service", async () => {
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request("/api/assets/not-a-uuid/custom-fields", {
      headers: {
        "X-Request-Id": "assets-custom-field-values-invalid-asset-id-request"
      }
    })

    expect(response.status).toBe(400)
    expect(assetService.listCustomFieldValues).not.toHaveBeenCalled()
  })

  it("upserts asset custom field values", async () => {
    const requestId = "assets-custom-field-values-upsert-request"
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"
    const payload = {
      values: [
        {
          fieldId: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
          value: "platform"
        }
      ]
    }
    const values = [
      {
        fieldId: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
        key: "category",
        name: "Category",
        source: AssetCustomFieldValueSource.Asset,
        type: AssetCustomFieldType.Text,
        value: "platform"
      }
    ]

    assetService.upsertCustomFieldValues.mockResolvedValue(values)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request(`/api/assets/${assetId}/custom-fields`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId
      },
      body: JSON.stringify(payload)
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(assetService.upsertCustomFieldValues).toHaveBeenCalledWith({
      assetId,
      values: payload.values,
      eventContext: {
        actor: user.id,
        correlationId: requestId
      }
    })
    expect(body).toEqual({
      correlationId: requestId,
      data: {
        items: values,
        totalItems: 1,
        startIndex: 0,
        currentItemCount: 1
      }
    })
  })

  it("assigns custom fields to an asset", async () => {
    const requestId = "assets-custom-field-associations-assign-request"
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"
    const payload = {
      fieldIds: ["5bde818a-bb4f-4a0f-a5eb-a190d5142a25"]
    }
    const values = [
      {
        fieldId: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
        key: "category",
        name: "Category",
        source: AssetCustomFieldValueSource.Empty,
        type: AssetCustomFieldType.Text,
        value: null
      }
    ]

    assetService.assignCustomFields.mockResolvedValue(values)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request(
      `/api/assets/${assetId}/custom-fields/associations`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": requestId
        },
        body: JSON.stringify(payload)
      }
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(assetService.assignCustomFields).toHaveBeenCalledWith({
      assetId,
      fieldIds: payload.fieldIds,
      eventContext: {
        actor: user.id,
        correlationId: requestId
      }
    })
    expect(body).toEqual({
      correlationId: requestId,
      data: {
        items: values,
        totalItems: 1,
        startIndex: 0,
        currentItemCount: 1
      }
    })
  })

  it("rejects invalid custom field association bodies before calling the service", async () => {
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request(
      `/api/assets/${assetId}/custom-fields/associations`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id":
            "assets-custom-field-associations-invalid-body-request"
        },
        body: JSON.stringify({ fieldIds: ["not-a-uuid"] })
      }
    )

    expect(response.status).toBe(400)
    expect(assetService.assignCustomFields).not.toHaveBeenCalled()
  })

  it("rejects invalid custom field value bodies before calling the service", async () => {
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request(`/api/assets/${assetId}/custom-fields`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "assets-custom-field-values-invalid-body-request"
      },
      body: JSON.stringify({
        values: [
          {
            fieldId: "not-a-uuid",
            value: "platform"
          }
        ]
      })
    })

    expect(response.status).toBe(400)
    expect(assetService.upsertCustomFieldValues).not.toHaveBeenCalled()
  })

  it("returns 404 when upserting custom field values for a missing asset", async () => {
    const requestId = "assets-custom-field-values-upsert-missing-asset-request"
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"
    const payload = {
      values: [
        {
          fieldId: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
          value: "platform"
        }
      ]
    }

    assetService.upsertCustomFieldValues.mockResolvedValue(null)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request(`/api/assets/${assetId}/custom-fields`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId
      },
      body: JSON.stringify(payload)
    })
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(assetService.upsertCustomFieldValues).toHaveBeenCalledWith({
      assetId,
      values: payload.values,
      eventContext: {
        actor: user.id,
        correlationId: requestId
      }
    })
    expect(body).toEqual({
      correlationId: requestId,
      status: 404,
      error: `asset with id ${assetId} does not exist`
    })
  })

  it("clears an asset custom field value", async () => {
    const requestId = "assets-custom-field-values-clear-request"
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"
    const fieldId = "5bde818a-bb4f-4a0f-a5eb-a190d5142a25"

    assetService.clearCustomFieldValue.mockResolvedValue(true)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request(
      `/api/assets/${assetId}/custom-fields/${fieldId}`,
      {
        method: "DELETE",
        headers: {
          "X-Request-Id": requestId
        }
      }
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(assetService.clearCustomFieldValue).toHaveBeenCalledWith({
      assetId,
      fieldId,
      eventContext: {
        actor: user.id,
        correlationId: requestId
      }
    })
    expect(body).toEqual({
      correlationId: requestId,
      data: {
        cleared: true
      }
    })
  })

  it("detaches a custom field from an asset", async () => {
    const requestId = "assets-custom-field-associations-detach-request"
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"
    const fieldId = "5bde818a-bb4f-4a0f-a5eb-a190d5142a25"

    assetService.detachCustomField.mockResolvedValue(true)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request(
      `/api/assets/${assetId}/custom-fields/associations/${fieldId}`,
      {
        method: "DELETE",
        headers: {
          "X-Request-Id": requestId
        }
      }
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(assetService.detachCustomField).toHaveBeenCalledWith({
      assetId,
      fieldId,
      eventContext: {
        actor: user.id,
        correlationId: requestId
      }
    })
    expect(body).toEqual({
      correlationId: requestId,
      data: {
        detached: true
      }
    })
  })

  it("returns 404 when clearing a custom field value for a missing asset", async () => {
    const requestId = "assets-custom-field-values-clear-missing-asset-request"
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"
    const fieldId = "5bde818a-bb4f-4a0f-a5eb-a190d5142a25"

    assetService.clearCustomFieldValue.mockResolvedValue(null)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request(
      `/api/assets/${assetId}/custom-fields/${fieldId}`,
      {
        method: "DELETE",
        headers: {
          "X-Request-Id": requestId
        }
      }
    )
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(assetService.clearCustomFieldValue).toHaveBeenCalledWith({
      assetId,
      fieldId,
      eventContext: {
        actor: user.id,
        correlationId: requestId
      }
    })
    expect(body).toEqual({
      correlationId: requestId,
      status: 404,
      error: `asset with id ${assetId} does not exist`
    })
  })

  it("returns 403 when upserting custom field values without write permission", async () => {
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"

    userHasPermission.mockResolvedValue(false)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request(`/api/assets/${assetId}/custom-fields`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "assets-custom-field-values-upsert-forbidden-request"
      },
      body: JSON.stringify({
        values: [
          {
            fieldId: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
            value: "platform"
          }
        ]
      })
    })

    expect(response.status).toBe(403)
    expect(userHasPermission).toHaveBeenCalledWith(user.id, {
      asset: ["write"]
    })
    expect(assetService.upsertCustomFieldValues).not.toHaveBeenCalled()
  })

  it("returns 201 when creating an asset", async () => {
    const requestId = "assets-create-request"
    const payload = {
      name: "worker.exposurenexus.local",
      type: AssetType.Host
    }
    const createdAsset = {
      id: "d8f05cbe-d12c-4d05-a969-cee572a77887",
      ownerId: null,
      ...payload
    }

    assetService.create.mockResolvedValue(createdAsset)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request("/api/assets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId
      },
      body: JSON.stringify(payload)
    })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(assetService.create).toHaveBeenCalledWith({
      asset: payload,
      eventContext: {
        actor: user.id,
        correlationId: requestId
      }
    })
    expect(body).toEqual({
      correlationId: requestId,
      data: createdAsset
    })
  })

  it("passes nullable asset owner ids when creating an asset", async () => {
    const requestId = "assets-create-with-owner-request"
    const payload = {
      name: "worker.exposurenexus.local",
      type: AssetType.Host,
      ownerId: "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d"
    }
    const createdAsset = {
      id: "d8f05cbe-d12c-4d05-a969-cee572a77887",
      ...payload
    }

    assetService.create.mockResolvedValue(createdAsset)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request("/api/assets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId
      },
      body: JSON.stringify(payload)
    })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(assetService.create).toHaveBeenCalledWith({
      asset: payload,
      eventContext: {
        actor: user.id,
        correlationId: requestId
      }
    })
    expect(body).toEqual({
      correlationId: requestId,
      data: createdAsset
    })
  })

  it("rejects invalid asset create bodies before calling the service", async () => {
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request("/api/assets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "assets-invalid-create-body-request"
      },
      body: JSON.stringify({
        name: "",
        type: AssetType.Host
      })
    })

    expect(response.status).toBe(400)
    expect(assetService.create).not.toHaveBeenCalled()
  })

  it("updates an asset owner", async () => {
    const requestId = "assets-owner-update-request"
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"
    const ownerId = "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d"
    const updatedAsset = {
      id: assetId,
      name: "worker.exposurenexus.local",
      type: AssetType.Host,
      ownerId
    }

    assetService.updateOwnerByID.mockResolvedValue(updatedAsset)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request(`/api/assets/${assetId}/owner`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId
      },
      body: JSON.stringify({ ownerId })
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(userHasPermission).toHaveBeenCalledWith(user.id, {
      asset: ["write"]
    })
    expect(assetService.updateOwnerByID).toHaveBeenCalledWith({
      id: assetId,
      ownerId,
      eventContext: {
        actor: user.id,
        correlationId: requestId
      }
    })
    expect(body).toEqual({
      correlationId: requestId,
      data: updatedAsset
    })
  })

  it("clears an asset owner", async () => {
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"
    const updatedAsset = {
      id: assetId,
      name: "worker.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null
    }

    assetService.updateOwnerByID.mockResolvedValue(updatedAsset)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request(`/api/assets/${assetId}/owner`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "assets-owner-clear-request"
      },
      body: JSON.stringify({ ownerId: null })
    })

    expect(response.status).toBe(200)
    expect(assetService.updateOwnerByID).toHaveBeenCalledWith({
      id: assetId,
      ownerId: null,
      eventContext: {
        actor: user.id,
        correlationId: "assets-owner-clear-request"
      }
    })
  })

  it("returns 403 when updating an asset owner without write permission", async () => {
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"

    userHasPermission.mockResolvedValue(false)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request(`/api/assets/${assetId}/owner`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "assets-owner-update-forbidden-request"
      },
      body: JSON.stringify({ ownerId: null })
    })

    expect(response.status).toBe(403)
    expect(userHasPermission).toHaveBeenCalledWith(user.id, {
      asset: ["write"]
    })
    expect(assetService.updateOwnerByID).not.toHaveBeenCalled()
  })

  it("rejects invalid asset owner update bodies before calling the service", async () => {
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request(`/api/assets/${assetId}/owner`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "assets-owner-invalid-update-request"
      },
      body: JSON.stringify({ ownerId: "not-a-user-id" })
    })

    expect(response.status).toBe(400)
    expect(assetService.updateOwnerByID).not.toHaveBeenCalled()
  })

  it("returns 404 when updating a missing asset owner", async () => {
    const requestId = "assets-owner-update-not-found-request"
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"

    assetService.updateOwnerByID.mockResolvedValue(null)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request(`/api/assets/${assetId}/owner`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId
      },
      body: JSON.stringify({ ownerId: null })
    })
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(assetService.updateOwnerByID).toHaveBeenCalledWith({
      id: assetId,
      ownerId: null,
      eventContext: {
        actor: user.id,
        correlationId: requestId
      }
    })
    expect(body).toEqual({
      correlationId: requestId,
      status: 404,
      error: `asset with id ${assetId} does not exist`
    })
  })

  it("deletes an asset by id", async () => {
    const requestId = "assets-delete-request"
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"
    const deletedAsset = {
      id: assetId,
      name: "api.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null
    }

    assetService.deleteByID.mockResolvedValue(deletedAsset)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request(`/api/assets/${assetId}`, {
      method: "DELETE",
      headers: {
        "X-Request-Id": requestId
      }
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(assetService.deleteByID).toHaveBeenCalledWith({
      id: assetId,
      eventContext: {
        actor: user.id,
        correlationId: requestId
      }
    })
    expect(body).toEqual({
      correlationId: requestId,
      data: deletedAsset
    })
  })

  it("returns 403 when deleting an asset without delete permission", async () => {
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"

    userHasPermission.mockResolvedValue(false)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request(`/api/assets/${assetId}`, {
      method: "DELETE",
      headers: {
        "X-Request-Id": "assets-delete-forbidden-request"
      }
    })

    expect(response.status).toBe(403)
    expect(userHasPermission).toHaveBeenCalledWith(user.id, {
      asset: ["delete"]
    })
    expect(assetService.deleteByID).not.toHaveBeenCalled()
  })

  it("returns 404 when deleting a missing asset", async () => {
    const requestId = "assets-delete-not-found-request"
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"

    assetService.deleteByID.mockResolvedValue(null)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request(`/api/assets/${assetId}`, {
      method: "DELETE",
      headers: {
        "X-Request-Id": requestId
      }
    })
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(assetService.deleteByID).toHaveBeenCalledWith({
      id: assetId,
      eventContext: {
        actor: user.id,
        correlationId: requestId
      }
    })
    expect(body).toEqual({
      correlationId: requestId,
      status: 404,
      error: `asset with id ${assetId} does not exist`
    })
  })

  it("returns 409 when deleting an asset that has linked findings", async () => {
    const requestId = "assets-delete-conflict-request"
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"

    assetService.deleteByID.mockRejectedValueOnce(
      new HTTPException(409, {
        message: `asset ${assetId} is still referenced by findings`
      })
    )

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService, routeDependencies)
    })

    const response = await app.request(`/api/assets/${assetId}`, {
      method: "DELETE",
      headers: {
        "X-Request-Id": requestId
      }
    })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toEqual({
      correlationId: requestId,
      status: 409,
      error: `asset ${assetId} is still referenced by findings`
    })
  })
})
