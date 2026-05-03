import { Hono } from "hono"
import { notFound, replyArray, replyObject } from "../lib/reply.js"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod/v4"
import {
  type Asset,
  type AssetCustomFieldDefinition,
  type AssetCustomFieldValue,
  type AssetWithCustomFields,
  createAssetSchema,
  updateAssetOwnerSchema,
  updateAssetCustomFieldAssociationsSchema,
  updateAssetCustomFieldValuesSchema
} from "@openvlp/types/model/asset"
import type { ContextVariables } from "../lib/hono-schema.js"
import type { RequireDomainPermission } from "../middleware/auth.js"
import {
  createAssetCustomFieldRoute,
  type AssetCustomFieldRouteService
} from "./asset-custom-fields.js"

interface AssetRouteService extends AssetCustomFieldRouteService {
  listAll(): Promise<Asset[]>
  listAllWithCustomFields(): Promise<AssetWithCustomFields[]>
  getByID(id: string): Promise<Asset | null>
  create(asset: typeof createAssetSchema._output): Promise<Asset>
  updateOwnerByID(
    id: string,
    ownerId: typeof updateAssetOwnerSchema._output.ownerId
  ): Promise<Asset | null>
  deleteByID(id: string): Promise<Asset | null>
  listCustomFieldValues(
    assetId: string
  ): Promise<AssetCustomFieldValue[] | null>
  listAvailableCustomFieldDefinitions(
    assetId: string
  ): Promise<AssetCustomFieldDefinition[] | null>
  upsertCustomFieldValues(
    assetId: string,
    values: typeof updateAssetCustomFieldValuesSchema._output.values
  ): Promise<AssetCustomFieldValue[] | null>
  clearCustomFieldValue(
    assetId: string,
    fieldId: string
  ): Promise<boolean | null>
  assignCustomFields(
    assetId: string,
    fieldIds: typeof updateAssetCustomFieldAssociationsSchema._output.fieldIds
  ): Promise<AssetCustomFieldValue[] | null>
  detachCustomField(assetId: string, fieldId: string): Promise<boolean | null>
}

interface AssetRouteDependencies {
  requireDomainPermission: RequireDomainPermission
}

const idParamValidator = zValidator("param", z.object({ id: z.uuidv4() }))
const listAssetQueryValidator = zValidator(
  "query",
  z.object({
    includeCustomFields: z
      .stringbool({
        truthy: ["true"],
        falsy: ["false"]
      })
      .optional()
  })
)
const assetAndFieldIdParamValidator = zValidator(
  "param",
  z.object({
    id: z.uuidv4(),
    fieldId: z.uuidv4()
  })
)

export function createAssetRoute(
  assetService: AssetRouteService,
  { requireDomainPermission }: AssetRouteDependencies
) {
  const asset = new Hono<{ Variables: ContextVariables }>()

  asset.get(
    "/",
    requireDomainPermission("asset", "read"),
    listAssetQueryValidator,
    async (c) => {
      const query = c.req.valid("query")
      const assets =
        query.includeCustomFields === true
          ? await assetService.listAllWithCustomFields()
          : await assetService.listAll()
      return replyArray(c, assets)
    }
  )

  asset.route(
    "/custom-fields",
    createAssetCustomFieldRoute(assetService, { requireDomainPermission })
  )

  asset.get(
    "/:id/custom-fields/available",
    requireDomainPermission("asset", "read"),
    idParamValidator,
    async (c) => {
      const params = c.req.valid("param")

      const definitions =
        await assetService.listAvailableCustomFieldDefinitions(params.id)
      if (!definitions) {
        notFound("asset", params.id)
      }

      return replyArray(c, definitions!)
    }
  )

  asset.get(
    "/:id/custom-fields",
    requireDomainPermission("asset", "read"),
    idParamValidator,
    async (c) => {
      const params = c.req.valid("param")

      const values = await assetService.listCustomFieldValues(params.id)
      if (!values) {
        notFound("asset", params.id)
      }

      return replyArray(c, values!)
    }
  )

  asset.put(
    "/:id/custom-fields/associations",
    requireDomainPermission("asset", "write"),
    idParamValidator,
    zValidator("json", updateAssetCustomFieldAssociationsSchema),
    async (c) => {
      const params = c.req.valid("param")
      const body = c.req.valid("json")

      const values = await assetService.assignCustomFields(
        params.id,
        body.fieldIds
      )
      if (!values) {
        notFound("asset", params.id)
      }

      return replyArray(c, values!)
    }
  )

  asset.delete(
    "/:id/custom-fields/associations/:fieldId",
    requireDomainPermission("asset", "write"),
    assetAndFieldIdParamValidator,
    async (c) => {
      const params = c.req.valid("param")

      const detached = await assetService.detachCustomField(
        params.id,
        params.fieldId
      )
      if (!detached) {
        notFound("asset", params.id)
      }

      return replyObject(c, { detached })
    }
  )

  asset.put(
    "/:id/custom-fields",
    requireDomainPermission("asset", "write"),
    idParamValidator,
    zValidator("json", updateAssetCustomFieldValuesSchema),
    async (c) => {
      const params = c.req.valid("param")
      const body = c.req.valid("json")

      const values = await assetService.upsertCustomFieldValues(
        params.id,
        body.values
      )
      if (!values) {
        notFound("asset", params.id)
      }

      return replyArray(c, values!)
    }
  )

  asset.delete(
    "/:id/custom-fields/:fieldId",
    requireDomainPermission("asset", "write"),
    assetAndFieldIdParamValidator,
    async (c) => {
      const params = c.req.valid("param")

      const cleared = await assetService.clearCustomFieldValue(
        params.id,
        params.fieldId
      )
      if (!cleared) {
        notFound("asset", params.id)
      }

      return replyObject(c, { cleared })
    }
  )

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

  asset.put(
    "/:id/owner",
    requireDomainPermission("asset", "write"),
    idParamValidator,
    zValidator("json", updateAssetOwnerSchema),
    async (c) => {
      const params = c.req.valid("param")
      const body = c.req.valid("json")

      const updatedAsset = await assetService.updateOwnerByID(
        params.id,
        body.ownerId
      )
      if (!updatedAsset) {
        notFound("asset", params.id)
      }

      return replyObject(c, updatedAsset!)
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
