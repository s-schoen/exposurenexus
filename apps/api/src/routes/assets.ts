import { Hono } from "hono"
import { notFound, replyArray, replyObject } from "../lib/reply.js"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod/v4"
import { createAssetSchema, type Asset } from "@openvlp/types/model/asset"
import type { ContextVariables } from "../lib/hono-schema.js"
import type { RequireDomainPermission } from "../middleware/auth.js"

interface AssetRouteService {
  listAll(): Promise<Asset[]>
  getByID(id: string): Promise<Asset | null>
  create(asset: typeof createAssetSchema._output): Promise<Asset>
  deleteByID(id: string): Promise<Asset | null>
}

interface AssetRouteDependencies {
  requireDomainPermission: RequireDomainPermission
}

const idParamValidator = zValidator("param", z.object({ id: z.uuidv4() }))

export function createAssetRoute(
  assetService: AssetRouteService,
  { requireDomainPermission }: AssetRouteDependencies
) {
  const asset = new Hono<{ Variables: ContextVariables }>()

  asset.get("/", requireDomainPermission("asset", "read"), async (c) => {
    const assets = await assetService.listAll()
    return replyArray(c, assets)
  })

  asset.get(
    "/:id",
    requireDomainPermission("asset", "read"),
    idParamValidator,
    async (c) => {
      const params = c.req.valid("param")

      const assetResult = await assetService.getByID(params.id)
      if (!assetResult) {
        notFound("asset", params.id)
      }

      return replyObject(c, assetResult!)
    }
  )

  asset.post(
    "/",
    requireDomainPermission("asset", "write"),
    zValidator("json", createAssetSchema),
    async (c) => {
      const body = c.req.valid("json")
      const createdAsset = await assetService.create(body)
      return replyObject(c, createdAsset, true)
    }
  )

  asset.delete(
    "/:id",
    requireDomainPermission("asset", "delete"),
    idParamValidator,
    async (c) => {
      const params = c.req.valid("param")

      const deleted = await assetService.deleteByID(params.id)
      if (!deleted) {
        notFound("asset", params.id)
      }

      return replyObject(c, deleted!)
    }
  )

  return asset
}
