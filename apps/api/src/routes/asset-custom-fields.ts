import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod/v4"
import { createAssetCustomFieldDefinitionSchema } from "@exposurenexus/types/model/asset"
import { notFound } from "../lib/api-error.js"
import { replyArray, replyObject } from "../lib/reply.js"
import type { ContextVariables } from "../lib/hono-schema.js"
import type { RequireDomainPermission } from "../middleware/auth.js"
import { requestEventContext } from "../lib/request-event-context.js"
import type { AssetService } from "../service/asset.js"

interface AssetCustomFieldRouteDependencies {
  requireDomainPermission: RequireDomainPermission
}

const fieldIdParamValidator = zValidator(
  "param",
  z.object({ fieldId: z.uuidv4() })
)

export function createAssetCustomFieldRoute(
  assetService: AssetService,
  { requireDomainPermission }: AssetCustomFieldRouteDependencies
) {
  const customField = new Hono<{ Variables: ContextVariables }>()

  customField.get(
    "/",
    requireDomainPermission("custom-field", "read"),
    async (c) => {
      const definitions = await assetService.listCustomFieldDefinitions()
      return replyArray(c, definitions)
    }
  )

  customField.get(
    "/:fieldId",
    requireDomainPermission("custom-field", "read"),
    fieldIdParamValidator,
    async (c) => {
      const params = c.req.valid("param")

      const definition = await assetService.getCustomFieldDefinitionByID(
        params.fieldId
      )
      if (!definition) {
        throw notFound("asset custom field", params.fieldId)
      }

      return replyObject(c, definition)
    }
  )

  customField.post(
    "/",
    requireDomainPermission("custom-field", "write"),
    zValidator("json", createAssetCustomFieldDefinitionSchema),
    async (c) => {
      const body = c.req.valid("json")
      const definition = await assetService.createCustomFieldDefinition(
        body,
        requestEventContext(c)
      )
      return replyObject(c, definition, true)
    }
  )

  customField.put(
    "/:fieldId",
    requireDomainPermission("custom-field", "write"),
    fieldIdParamValidator,
    zValidator("json", createAssetCustomFieldDefinitionSchema),
    async (c) => {
      const params = c.req.valid("param")
      const body = c.req.valid("json")

      const definition = await assetService.updateCustomFieldDefinitionByID({
        id: params.fieldId,
        definition: body,
        eventContext: requestEventContext(c)
      })
      if (!definition) {
        throw notFound("asset custom field", params.fieldId)
      }

      return replyObject(c, definition)
    }
  )

  customField.delete(
    "/:fieldId",
    requireDomainPermission("custom-field", "delete"),
    fieldIdParamValidator,
    async (c) => {
      const params = c.req.valid("param")

      const definition = await assetService.deleteCustomFieldDefinitionByID(
        params.fieldId,
        requestEventContext(c)
      )
      if (!definition) {
        throw notFound("asset custom field", params.fieldId)
      }

      return replyObject(c, definition)
    }
  )

  return customField
}
