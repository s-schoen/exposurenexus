import { Hono, type Context } from "hono"
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
import type { DomainEventContext } from "../lib/eventbus/events/index.js"
import type { RequireDomainPermission } from "../middleware/auth.js"
import {
  createAssetCustomFieldRoute,
  type AssetCustomFieldRouteService
} from "./asset-custom-fields.js"

interface AssetRouteService extends AssetCustomFieldRouteService {
  listAll(): Promise<Asset[]>
  listAllWithCustomFields(): Promise<AssetWithCustomFields[]>
  getByID(id: string): Promise<Asset | null>
  create(options: {
    asset: typeof createAssetSchema._output
    eventContext?: DomainEventContext
  }): Promise<Asset>
  updateOwnerByID(options: {
    id: string
    ownerId: typeof updateAssetOwnerSchema._output.ownerId
    eventContext?: DomainEventContext
  }): Promise<Asset | null>
  deleteByID(options: {
    id: string
    eventContext?: DomainEventContext
  }): Promise<Asset | null>
  listCustomFieldValues(
    assetId: string
  ): Promise<AssetCustomFieldValue[] | null>
  listAvailableCustomFieldDefinitions(
    assetId: string
  ): Promise<AssetCustomFieldDefinition[] | null>
  upsertCustomFieldValues(options: {
    assetId: string
    values: typeof updateAssetCustomFieldValuesSchema._output.values
    eventContext?: DomainEventContext
  }): Promise<AssetCustomFieldValue[] | null>
  clearCustomFieldValue(options: {
    assetId: string
    fieldId: string
    eventContext?: DomainEventContext
  }): Promise<boolean | null>
  assignCustomFields(options: {
    assetId: string
    fieldIds: typeof updateAssetCustomFieldAssociationsSchema._output.fieldIds
    eventContext?: DomainEventContext
  }): Promise<AssetCustomFieldValue[] | null>
  detachCustomField(options: {
    assetId: string
    fieldId: string
    eventContext?: DomainEventContext
  }): Promise<boolean | null>
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

function requestEventContext(
  c: Context<{ Variables: ContextVariables }>
): DomainEventContext {
  const actor = c.get("user")?.id

  return {
    ...(actor !== undefined ? { actor } : {}),
    correlationId: c.get("requestId")
  }
}

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

      const values = await assetService.assignCustomFields({
        assetId: params.id,
        fieldIds: body.fieldIds,
        eventContext: requestEventContext(c)
      })
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

      const detached = await assetService.detachCustomField({
        assetId: params.id,
        fieldId: params.fieldId,
        eventContext: requestEventContext(c)
      })
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

      const values = await assetService.upsertCustomFieldValues({
        assetId: params.id,
        values: body.values,
        eventContext: requestEventContext(c)
      })
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

      const cleared = await assetService.clearCustomFieldValue({
        assetId: params.id,
        fieldId: params.fieldId,
        eventContext: requestEventContext(c)
      })
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
      const createdAsset = await assetService.create({
        asset: body,
        eventContext: requestEventContext(c)
      })
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

      const deleted = await assetService.deleteByID({
        id: params.id,
        eventContext: requestEventContext(c)
      })
      if (!deleted) {
        notFound("asset", params.id)
      }

      return replyObject(c, deleted!)
    }
  )

  return asset
}
