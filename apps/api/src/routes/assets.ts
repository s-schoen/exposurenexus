import { Hono } from "hono"
import { notFound } from "../lib/api-error.js"
import { replyArray, replyObject } from "../lib/reply.js"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod/v4"
import {
  createAssetSchema,
  updateAssetOwnerSchema,
  updateAssetCustomFieldAssociationsSchema,
  updateAssetCustomFieldValuesSchema
} from "@exposurenexus/types/model/asset"
import type { ContextVariables } from "../lib/hono-schema.js"
import { requestEventContext } from "../lib/request-event-context.js"
import type { RequireDomainPermission } from "../middleware/auth.js"
import { createAssetCustomFieldRoute } from "./asset-custom-fields.js"
import type { AssetService } from "../service/asset.js"

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
export function createAssetRoute(
  assetService: AssetService,
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
        throw notFound("asset", params.id)
      }

      return replyArray(c, definitions)
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
        throw notFound("asset", params.id)
      }

      return replyArray(c, values)
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

      const values = await assetService.replaceCustomFieldAssociations({
        assetId: params.id,
        fieldIds: body.fieldIds,
        eventContext: requestEventContext(c)
      })
      if (!values) {
        throw notFound("asset", params.id)
      }

      return replyArray(c, values)
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

      const values = await assetService.replaceCustomFieldValues({
        assetId: params.id,
        values: body.values,
        eventContext: requestEventContext(c)
      })
      if (!values) {
        throw notFound("asset", params.id)
      }

      return replyArray(c, values)
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
        throw notFound("asset", params.id)
      }

      return replyObject(c, assetResult)
    }
  )

  asset.post(
    "/",
    requireDomainPermission("asset", "write"),
    zValidator("json", createAssetSchema),
    async (c) => {
      const body = c.req.valid("json")
      const createdAsset = await assetService.create(
        body,
        requestEventContext(c)
      )
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

      const updatedAsset = await assetService.updateOwnerByID({
        id: params.id,
        ownerId: body.ownerId,
        eventContext: requestEventContext(c)
      })
      if (!updatedAsset) {
        throw notFound("asset", params.id)
      }

      return replyObject(c, updatedAsset)
    }
  )

  asset.delete(
    "/:id",
    requireDomainPermission("asset", "delete"),
    idParamValidator,
    async (c) => {
      const params = c.req.valid("param")

      const deleted = await assetService.deleteByID(
        params.id,
        requestEventContext(c)
      )
      if (!deleted) {
        throw notFound("asset", params.id)
      }

      return replyObject(c, deleted)
    }
  )

  return asset
}
