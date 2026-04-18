import { beforeEach, describe, expect, it, vi } from "vitest"
import { AssetType } from "@openvlp/types/model/asset"

vi.mock("../lib/auth.js", () => ({
  auth: {
    api: {
      userHasPermission: vi.fn()
    }
  }
}))

import { auth } from "../lib/auth.js"
import {
  annotateAuthenticatedUser,
  createTestApp,
  createTestUser,
  requireAuthenticatedUser
} from "../test/app.js"
import { createAssetRoute } from "./assets.js"

describe("asset routes", () => {
  const user = createTestUser()
  const assetService = {
    listAll: vi.fn(),
    getByID: vi.fn(),
    create: vi.fn(),
    deleteByID: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth.api.userHasPermission).mockResolvedValue(true)
  })

  it("returns 401 for unauthenticated requests", async () => {
    const requestId = "assets-unauthorized-request"
    const app = createTestApp({
      assetRoute: createAssetRoute(assetService),
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
        name: "api.openvlp.local",
        type: AssetType.Host
      }
    ]

    assetService.listAll.mockResolvedValue(assets)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService)
    })

    const response = await app.request("/api/assets", {
      headers: {
        "X-Request-Id": requestId
      }
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(assetService.listAll).toHaveBeenCalledOnce()
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
      assetRoute: createAssetRoute(assetService)
    })

    const response = await app.request("/api/assets/not-a-uuid", {
      headers: {
        "X-Request-Id": "assets-invalid-id-request"
      }
    })

    expect(response.status).toBe(400)
    expect(assetService.getByID).not.toHaveBeenCalled()
  })

  it("returns 404 when the asset does not exist", async () => {
    const requestId = "assets-not-found-request"
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"

    assetService.getByID.mockResolvedValue(null)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService)
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
      name: "api.openvlp.local",
      type: AssetType.Host
    }

    assetService.getByID.mockResolvedValue(assetRecord)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService)
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

  it("returns 201 when creating an asset", async () => {
    const requestId = "assets-create-request"
    const payload = {
      name: "worker.openvlp.local",
      type: AssetType.Host
    }
    const createdAsset = {
      id: "d8f05cbe-d12c-4d05-a969-cee572a77887",
      ...payload
    }

    assetService.create.mockResolvedValue(createdAsset)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService)
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
    expect(assetService.create).toHaveBeenCalledWith(payload)
    expect(body).toEqual({
      correlationId: requestId,
      data: createdAsset
    })
  })

  it("rejects invalid asset create bodies before calling the service", async () => {
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService)
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

  it("deletes an asset by id", async () => {
    const requestId = "assets-delete-request"
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"
    const deletedAsset = {
      id: assetId,
      name: "api.openvlp.local",
      type: AssetType.Host
    }

    assetService.deleteByID.mockResolvedValue(deletedAsset)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService)
    })

    const response = await app.request(`/api/assets/${assetId}`, {
      method: "DELETE",
      headers: {
        "X-Request-Id": requestId
      }
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(assetService.deleteByID).toHaveBeenCalledWith(assetId)
    expect(body).toEqual({
      correlationId: requestId,
      data: deletedAsset
    })
  })

  it("returns 403 when deleting an asset without delete permission", async () => {
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"

    vi.mocked(auth.api.userHasPermission).mockResolvedValue(false)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      assetRoute: createAssetRoute(assetService)
    })

    const response = await app.request(`/api/assets/${assetId}`, {
      method: "DELETE",
      headers: {
        "X-Request-Id": "assets-delete-forbidden-request"
      }
    })

    expect(response.status).toBe(403)
    expect(auth.api.userHasPermission).toHaveBeenCalledWith({
      body: {
        userId: user.id,
        permissions: {
          asset: ["delete"]
        }
      }
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
      assetRoute: createAssetRoute(assetService)
    })

    const response = await app.request(`/api/assets/${assetId}`, {
      method: "DELETE",
      headers: {
        "X-Request-Id": requestId
      }
    })
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(assetService.deleteByID).toHaveBeenCalledWith(assetId)
    expect(body).toEqual({
      correlationId: requestId,
      status: 404,
      error: `asset with id ${assetId} does not exist`
    })
  })
})
