import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod/v4"
import {
  type AssetCustomFieldDefinition,
  createAssetCustomFieldDefinitionSchema
} from "@openvlp/types/model/asset"
import { notFound, replyArray, replyObject } from "../lib/reply.js"
import type { ContextVariables } from "../lib/hono-schema.js"
import type { RequireDomainPermission } from "../middleware/auth.js"

export interface AssetCustomFieldRouteService {
  listCustomFieldDefinitions(): Promise<AssetCustomFieldDefinition[]>
  getCustomFieldDefinitionByID(
    id: string
  ): Promise<AssetCustomFieldDefinition | null>
  createCustomFieldDefinition(
    definition: typeof createAssetCustomFieldDefinitionSchema._output
  ): Promise<AssetCustomFieldDefinition>
  updateCustomFieldDefinitionByID(
    id: string,
    definition: typeof createAssetCustomFieldDefinitionSchema._output
  ): Promise<AssetCustomFieldDefinition | null>
  deleteCustomFieldDefinitionByID(
    id: string
  ): Promise<AssetCustomFieldDefinition | null>
}

interface AssetCustomFieldRouteDependencies {
  requireDomainPermission: RequireDomainPermission
}

const fieldIdParamValidator = zValidator(
  "param",
  z.object({ fieldId: z.uuidv4() })
)

export function createAssetCustomFieldRoute(
  assetService: AssetCustomFieldRouteService,
  { requireDomainPermission }: AssetCustomFieldRouteDependencies
) {
  const customField = new Hono<{ Variables: ContextVariables }>()

  customField.get("/", requireDomainPermission("asset", "read"), async (c) => {
    const definitions = await assetService.listCustomFieldDefinitions()
    return replyArray(c, definitions)
  })

  customField.get(
    "/:fieldId",
    requireDomainPermission("asset", "read"),
    fieldIdParamValidator,
    async (c) => {
      const params = c.req.valid("param")

      const definition = await assetService.getCustomFieldDefinitionByID(
        params.fieldId
      )
      if (!definition) {
        notFound("asset custom field", params.fieldId)
      }

      return replyObject(c, definition!)
    }
  )

  customField.post(
    "/",
    requireDomainPermission("asset", "write"),
    zValidator("json", createAssetCustomFieldDefinitionSchema),
    async (c) => {
      const body = c.req.valid("json")
      const definition = await assetService.createCustomFieldDefinition(body)
      return replyObject(c, definition, true)
    }
  )

  customField.put(
    "/:fieldId",
    requireDomainPermission("asset", "write"),
    fieldIdParamValidator,
    zValidator("json", createAssetCustomFieldDefinitionSchema),
    async (c) => {
      const params = c.req.valid("param")
      const body = c.req.valid("json")

      const definition = await assetService.updateCustomFieldDefinitionByID(
        params.fieldId,
        body
      )
      if (!definition) {
        notFound("asset custom field", params.fieldId)
      }

      return replyObject(c, definition!)
    }
  )

  customField.delete(
    "/:fieldId",
    requireDomainPermission("asset", "delete"),
    fieldIdParamValidator,
    async (c) => {
      const params = c.req.valid("param")

      const definition = await assetService.deleteCustomFieldDefinitionByID(
        params.fieldId
      )
      if (!definition) {
        notFound("asset custom field", params.fieldId)
      }

      return replyObject(c, definition!)
    }
  )

  return customField
}
