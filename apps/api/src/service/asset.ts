import {
  type Asset,
  type AssetCustomFieldDefinition,
  type AssetCustomFieldValue,
  type AssetCustomFieldValueLiteral,
  type CreateAssetCustomFieldDefinition,
  AssetCustomFieldType,
  AssetType,
  type CreateAsset,
  type UpdateAssetCustomFieldValue
} from "@openvlp/types/model/asset"
import { HTTPException } from "hono/http-exception"
import type { Logger } from "pino"
import { badRequest, conflict, isConflictError } from "./errors.js"

function hasDuplicateValues(values: readonly string[]): boolean {
  return new Set(values).size !== values.length
}

function getDefaultValue(
  definition: CreateAssetCustomFieldDefinition
): AssetCustomFieldValueLiteral {
  return definition.defaultValue ?? null
}

function isValidValueForDefinition(
  definition: AssetCustomFieldDefinition,
  value: Exclude<AssetCustomFieldValueLiteral, null>
): boolean {
  switch (definition.type) {
    case AssetCustomFieldType.Text:
      return typeof value === "string"
    case AssetCustomFieldType.Number:
      return typeof value === "number"
    case AssetCustomFieldType.Select:
      return (
        typeof value === "string" &&
        definition.options.some((option) => option.value === value)
      )
  }
}

function validateCustomFieldDefinition(
  definition: CreateAssetCustomFieldDefinition
): void {
  const defaultValue = getDefaultValue(definition)

  if (definition.required && defaultValue === null) {
    throw badRequest("required custom fields must define a default value")
  }

  switch (definition.type) {
    case AssetCustomFieldType.Text:
      if (defaultValue !== null && typeof defaultValue !== "string") {
        throw badRequest("text custom field default must be a string")
      }
      return
    case AssetCustomFieldType.Number:
      if (defaultValue !== null && typeof defaultValue !== "number") {
        throw badRequest("number custom field default must be a number")
      }
      return
    case AssetCustomFieldType.Select: {
      const optionValues = definition.options.map((option) => option.value)

      if (hasDuplicateValues(optionValues)) {
        throw badRequest("select custom field options must be unique")
      }

      if (defaultValue !== null && typeof defaultValue !== "string") {
        throw badRequest("select custom field default must be a string")
      }

      if (defaultValue !== null && !optionValues.includes(defaultValue)) {
        throw badRequest(
          "select custom field default must match an option value"
        )
      }
    }
  }
}

interface AssetRepository {
  list(): Promise<Asset[]>
  getByID(id: string): Promise<Asset | null>
  getByName(name: string, type?: AssetType): Promise<Asset | null>
  create(asset: Asset): Promise<Asset>
  deleteByID(id: string): Promise<Asset | null>
  listCustomFieldDefinitions(): Promise<AssetCustomFieldDefinition[]>
  listAvailableCustomFieldDefinitions(
    assetId: string
  ): Promise<AssetCustomFieldDefinition[]>
  getCustomFieldDefinitionByID(
    id: string
  ): Promise<AssetCustomFieldDefinition | null>
  createCustomFieldDefinition(
    definition: CreateAssetCustomFieldDefinition
  ): Promise<AssetCustomFieldDefinition>
  updateCustomFieldDefinitionByID(
    id: string,
    definition: CreateAssetCustomFieldDefinition
  ): Promise<AssetCustomFieldDefinition | null>
  deleteCustomFieldDefinitionByID(
    id: string
  ): Promise<AssetCustomFieldDefinition | null>
  listCustomFieldValues(assetId: string): Promise<AssetCustomFieldValue[]>
  upsertCustomFieldValues(
    assetId: string,
    values: UpdateAssetCustomFieldValue[]
  ): Promise<AssetCustomFieldValue[]>
  clearCustomFieldValue(assetId: string, fieldId: string): Promise<void>
  assignCustomFields(
    assetId: string,
    fieldIds: string[]
  ): Promise<AssetCustomFieldValue[]>
  detachCustomField(assetId: string, fieldId: string): Promise<void>
}

interface AssetServiceDependencies {
  assetRepository: AssetRepository
  logger: Logger
}

export function createAssetService({
  assetRepository,
  logger
}: AssetServiceDependencies) {
  return {
    async listAll(): Promise<Asset[]> {
      try {
        return await assetRepository.list()
      } catch (error) {
        logger.error(error, "failed to list assets")
        throw new HTTPException(500, {
          message: "failed to list assets"
        })
      }
    },

    async getByID(id: string): Promise<Asset | null> {
      try {
        const asset = await assetRepository.getByID(id)
        if (!asset) {
          logger.debug(`asset with id ${id} not found`)
        }
        return asset
      } catch (error) {
        logger.error(error, `failed to get asset with id ${id}`)
        throw new HTTPException(500, {
          message: "failed to get asset"
        })
      }
    },

    async getByName(name: string, type?: AssetType): Promise<Asset | null> {
      try {
        const asset = await assetRepository.getByName(name, type)
        if (!asset) {
          logger.debug(`asset with name='${name}' and type=${type} not found`)
        }
        return asset
      } catch (error) {
        logger.error(
          error,
          `failed to get asset with name='${name}' and type=${type}`
        )
        throw new HTTPException(500, {
          message: "failed to get asset"
        })
      }
    },

    async create(asset: CreateAsset): Promise<Asset> {
      try {
        const created = await assetRepository.create({
          id: "",
          ...asset
        })

        logger.info(`created asset ${created.id}: ${created.name}`)
        return created
      } catch (error) {
        logger.error(error, `failed to create new asset ${asset.name}`)
        throw new HTTPException(500, {
          message: "failed to create asset"
        })
      }
    },

    async deleteByID(id: string): Promise<Asset | null> {
      try {
        const asset = await assetRepository.deleteByID(id)
        if (!asset) {
          logger.debug(`cannot delete asset ${id}: not found`)
        }
        return asset
      } catch (error) {
        logger.error(error, `failed to get asset with id ${id}`)
        throw new HTTPException(500, {
          message: "failed to get asset"
        })
      }
    },

    async listCustomFieldDefinitions(): Promise<AssetCustomFieldDefinition[]> {
      try {
        return await assetRepository.listCustomFieldDefinitions()
      } catch (error) {
        logger.error(error, "failed to list asset custom field definitions")
        throw new HTTPException(500, {
          message: "failed to list asset custom field definitions"
        })
      }
    },

    async getCustomFieldDefinitionByID(
      id: string
    ): Promise<AssetCustomFieldDefinition | null> {
      try {
        const definition =
          await assetRepository.getCustomFieldDefinitionByID(id)
        if (!definition) {
          logger.debug(`asset custom field definition with id ${id} not found`)
        }
        return definition
      } catch (error) {
        logger.error(
          error,
          `failed to get asset custom field definition with id ${id}`
        )
        throw new HTTPException(500, {
          message: "failed to get asset custom field definition"
        })
      }
    },

    async createCustomFieldDefinition(
      definition: CreateAssetCustomFieldDefinition
    ): Promise<AssetCustomFieldDefinition> {
      validateCustomFieldDefinition(definition)

      try {
        return await assetRepository.createCustomFieldDefinition(definition)
      } catch (error) {
        if (isConflictError(error)) {
          logger.debug(error, "asset custom field definition create conflict")
          throw conflict("asset custom field definition already exists")
        }

        logger.error(
          error,
          `failed to create asset custom field definition ${definition.key}`
        )
        throw new HTTPException(500, {
          message: "failed to create asset custom field definition"
        })
      }
    },

    async updateCustomFieldDefinitionByID(
      id: string,
      definition: CreateAssetCustomFieldDefinition
    ): Promise<AssetCustomFieldDefinition | null> {
      validateCustomFieldDefinition(definition)

      try {
        const updated = await assetRepository.updateCustomFieldDefinitionByID(
          id,
          definition
        )
        if (!updated) {
          logger.debug(`asset custom field definition with id ${id} not found`)
        }
        return updated
      } catch (error) {
        if (isConflictError(error)) {
          logger.debug(error, "asset custom field definition update conflict")
          throw conflict("asset custom field definition already exists")
        }

        logger.error(
          error,
          `failed to update asset custom field definition with id ${id}`
        )
        throw new HTTPException(500, {
          message: "failed to update asset custom field definition"
        })
      }
    },

    async deleteCustomFieldDefinitionByID(
      id: string
    ): Promise<AssetCustomFieldDefinition | null> {
      try {
        const deleted =
          await assetRepository.deleteCustomFieldDefinitionByID(id)
        if (!deleted) {
          logger.debug(`asset custom field definition with id ${id} not found`)
        }
        return deleted
      } catch (error) {
        logger.error(
          error,
          `failed to delete asset custom field definition with id ${id}`
        )
        throw new HTTPException(500, {
          message: "failed to delete asset custom field definition"
        })
      }
    },

    async listCustomFieldValues(
      assetId: string
    ): Promise<AssetCustomFieldValue[] | null> {
      try {
        const asset = await assetRepository.getByID(assetId)
        if (!asset) {
          logger.debug(`asset with id ${assetId} not found`)
          return null
        }

        return await assetRepository.listCustomFieldValues(assetId)
      } catch (error) {
        logger.error(
          error,
          `failed to list asset custom field values for asset ${assetId}`
        )
        throw new HTTPException(500, {
          message: "failed to list asset custom field values"
        })
      }
    },

    async listAvailableCustomFieldDefinitions(
      assetId: string
    ): Promise<AssetCustomFieldDefinition[] | null> {
      try {
        const asset = await assetRepository.getByID(assetId)
        if (!asset) {
          logger.debug(`asset with id ${assetId} not found`)
          return null
        }

        return await assetRepository.listAvailableCustomFieldDefinitions(
          assetId
        )
      } catch (error) {
        logger.error(
          error,
          `failed to list available asset custom fields for asset ${assetId}`
        )
        throw new HTTPException(500, {
          message: "failed to list available asset custom fields"
        })
      }
    },

    async upsertCustomFieldValues(
      assetId: string,
      values: UpdateAssetCustomFieldValue[]
    ): Promise<AssetCustomFieldValue[] | null> {
      try {
        const asset = await assetRepository.getByID(assetId)
        if (!asset) {
          logger.debug(`asset with id ${assetId} not found`)
          return null
        }

        const definitions = await assetRepository.listCustomFieldDefinitions()
        const definitionsById = new Map(
          definitions.map((definition) => [definition.id, definition])
        )
        const assignedValues =
          await assetRepository.listCustomFieldValues(assetId)
        const assignedFieldIds = new Set(
          assignedValues.map((value) => value.fieldId)
        )

        for (const valueUpdate of values) {
          const definition = definitionsById.get(valueUpdate.fieldId)
          if (!definition) {
            throw badRequest(
              `unknown asset custom field id ${valueUpdate.fieldId}`
            )
          }

          if (!assignedFieldIds.has(valueUpdate.fieldId)) {
            throw badRequest("asset custom field is not assigned to asset")
          }

          if (
            valueUpdate.value !== null &&
            !isValidValueForDefinition(definition, valueUpdate.value)
          ) {
            throw badRequest(
              `invalid value for asset custom field ${definition.key}`
            )
          }
        }

        return await assetRepository.upsertCustomFieldValues(assetId, values)
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error
        }

        logger.error(
          error,
          `failed to upsert asset custom field values for asset ${assetId}`
        )
        throw new HTTPException(500, {
          message: "failed to update asset custom field values"
        })
      }
    },

    async clearCustomFieldValue(
      assetId: string,
      fieldId: string
    ): Promise<boolean | null> {
      try {
        const asset = await assetRepository.getByID(assetId)
        if (!asset) {
          logger.debug(`asset with id ${assetId} not found`)
          return null
        }

        const definition =
          await assetRepository.getCustomFieldDefinitionByID(fieldId)
        if (!definition) {
          throw badRequest(`unknown asset custom field id ${fieldId}`)
        }

        const assignedValues =
          await assetRepository.listCustomFieldValues(assetId)
        if (!assignedValues.some((value) => value.fieldId === fieldId)) {
          throw badRequest("asset custom field is not assigned to asset")
        }

        await assetRepository.clearCustomFieldValue(assetId, fieldId)
        return true
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error
        }

        logger.error(
          error,
          `failed to clear asset custom field ${fieldId} for asset ${assetId}`
        )
        throw new HTTPException(500, {
          message: "failed to clear asset custom field value"
        })
      }
    },

    async assignCustomFields(
      assetId: string,
      fieldIds: string[]
    ): Promise<AssetCustomFieldValue[] | null> {
      try {
        const asset = await assetRepository.getByID(assetId)
        if (!asset) {
          logger.debug(`asset with id ${assetId} not found`)
          return null
        }

        const definitions = await assetRepository.listCustomFieldDefinitions()
        const definitionIds = new Set(
          definitions.map((definition) => definition.id)
        )

        for (const fieldId of fieldIds) {
          if (!definitionIds.has(fieldId)) {
            throw badRequest(`unknown asset custom field id ${fieldId}`)
          }
        }

        return await assetRepository.assignCustomFields(assetId, fieldIds)
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error
        }

        logger.error(
          error,
          `failed to assign asset custom fields for asset ${assetId}`
        )
        throw new HTTPException(500, {
          message: "failed to assign asset custom fields"
        })
      }
    },

    async detachCustomField(
      assetId: string,
      fieldId: string
    ): Promise<boolean | null> {
      try {
        const asset = await assetRepository.getByID(assetId)
        if (!asset) {
          logger.debug(`asset with id ${assetId} not found`)
          return null
        }

        const definition =
          await assetRepository.getCustomFieldDefinitionByID(fieldId)
        if (!definition) {
          throw badRequest(`unknown asset custom field id ${fieldId}`)
        }

        await assetRepository.detachCustomField(assetId, fieldId)
        return true
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error
        }

        logger.error(
          error,
          `failed to detach asset custom field ${fieldId} for asset ${assetId}`
        )
        throw new HTTPException(500, {
          message: "failed to detach asset custom field"
        })
      }
    }
  }
}
