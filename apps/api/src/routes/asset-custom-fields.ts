import { Hono, type Context } from "hono"
import { HTTPException } from "hono/http-exception"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod/v4"
import {
  type AssetCustomFieldDefinition,
  type AssetCustomFieldRuleViolation,
  AssetCustomFieldRuleViolationCode,
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

const assetCustomFieldRuleViolationCodes = new Set<string>(
  Object.values(AssetCustomFieldRuleViolationCode)
)

function isAssetCustomFieldRuleViolation(
  cause: unknown
): cause is AssetCustomFieldRuleViolation {
  if (!cause || typeof cause !== "object") {
    return false
  }

  const code = (cause as { code?: unknown }).code
  return (
    typeof code === "string" && assetCustomFieldRuleViolationCodes.has(code)
  )
}

function isAssetCustomFieldRuleValidationError(
  error: unknown
): error is HTTPException & { cause: AssetCustomFieldRuleViolation } {
  return (
    error instanceof HTTPException &&
    error.status === 400 &&
    isAssetCustomFieldRuleViolation(error.cause)
  )
}

function replyCustomFieldRuleValidationError(
  c: Context<{ Variables: ContextVariables }>,
  error: HTTPException & { cause: AssetCustomFieldRuleViolation }
) {
  const correlationId = c.get("requestId")
  c.status(error.status)
  return c.json({
    correlationId,
    status: error.status,
    error: error.message,
    code: error.cause.code
  })
}

export function createAssetCustomFieldRoute(
  assetService: AssetCustomFieldRouteService,
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
        notFound("asset custom field", params.fieldId)
      }

      return replyObject(c, definition!)
    }
  )

  customField.post(
    "/",
    requireDomainPermission("custom-field", "write"),
    zValidator("json", createAssetCustomFieldDefinitionSchema),
    async (c) => {
      const body = c.req.valid("json")
      try {
        const definition = await assetService.createCustomFieldDefinition(body)
        return replyObject(c, definition, true)
      } catch (error) {
        if (isAssetCustomFieldRuleValidationError(error)) {
          return replyCustomFieldRuleValidationError(c, error)
        }

        throw error
      }
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

      try {
        const definition = await assetService.updateCustomFieldDefinitionByID(
          params.fieldId,
          body
        )
        if (!definition) {
          notFound("asset custom field", params.fieldId)
        }

        return replyObject(c, definition!)
      } catch (error) {
        if (isAssetCustomFieldRuleValidationError(error)) {
          return replyCustomFieldRuleValidationError(c, error)
        }

        throw error
      }
    }
  )

  customField.delete(
    "/:fieldId",
    requireDomainPermission("custom-field", "delete"),
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
