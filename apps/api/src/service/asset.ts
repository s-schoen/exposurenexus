import {
  type Asset,
  type AssetCustomFieldDefinition,
  type AssetCustomFieldRuleViolation,
  type AssetCustomFieldValue,
  type AssetCustomFieldValueLiteral,
  type CreateAssetCustomFieldDefinition,
  type AssetWithCustomFields,
  AssetCustomFieldRuleViolationReason,
  AssetCustomFieldType,
  AssetType,
  type CreateAsset,
  type UpdateAssetCustomFieldValue,
  validateAssetCustomFieldDefinitionRules
} from "@exposurenexus/types/model/asset"
import { HTTPException } from "hono/http-exception"
import type { Logger } from "pino"
import type { UserProfile } from "@exposurenexus/types/model/user"
import {
  badRequest,
  conflict,
  isConflictError,
  isForeignKeyError
} from "./errors.js"
import {
  createDomainEventEmitter,
  type AssetEventPayloads,
  type CustomFieldEventPayloads,
  type DomainEventContext,
  type DomainEventEmitter
} from "../lib/eventbus/events/index.js"

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

function customFieldRuleViolationMessage(
  violation: AssetCustomFieldRuleViolation
): string {
  switch (violation.reason) {
    case AssetCustomFieldRuleViolationReason.RequiredDefaultMissing:
      return "required custom fields must define a default value"
    case AssetCustomFieldRuleViolationReason.TextDefaultMustBeString:
      return "text custom field default must be a string"
    case AssetCustomFieldRuleViolationReason.NumberDefaultMustBeNumber:
      return "number custom field default must be a number"
    case AssetCustomFieldRuleViolationReason.SelectDefaultMustBeString:
      return "select custom field default must be a string"
    case AssetCustomFieldRuleViolationReason.SelectDefaultMustMatchOption:
      return "select custom field default must match an option value"
    case AssetCustomFieldRuleViolationReason.SelectOptionValuesMustBeUnique:
      return "select custom field options must be unique"
  }
}

function validateCustomFieldDefinition(
  definition: CreateAssetCustomFieldDefinition
): void {
  const [violation] = validateAssetCustomFieldDefinitionRules(definition)

  if (violation) {
    throw new HTTPException(400, {
      message: customFieldRuleViolationMessage(violation),
      cause: violation
    })
  }
}

function assetSnapshotsEqual(
  previous: AssetWithCustomFields,
  current: AssetWithCustomFields
): boolean {
  return JSON.stringify(previous) === JSON.stringify(current)
}

function customFieldDefinitionsEqual(
  previous: AssetCustomFieldDefinition,
  current: AssetCustomFieldDefinition
): boolean {
  return JSON.stringify(previous) === JSON.stringify(current)
}

interface AssetRepository {
  list(): Promise<Asset[]>
  listWithCustomFields(): Promise<AssetWithCustomFields[]>
  getByID(id: string): Promise<Asset | null>
  getByIDWithCustomFields(id: string): Promise<AssetWithCustomFields | null>
  getByName(name: string, type?: AssetType): Promise<Asset | null>
  create(asset: Asset): Promise<Asset>
  updateOwnerByID(id: string, ownerId: Asset["ownerId"]): Promise<Asset | null>
  deleteByID(id: string): Promise<Asset | null>
  countFindingsByAssetID(id: string): Promise<number>
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

interface UserProfileLookupService {
  getByID(id: string): Promise<UserProfile | null>
}

interface AssetServiceDependencies {
  assetRepository: AssetRepository
  userProfileService: UserProfileLookupService
  domainEventEmitter: DomainEventEmitter
  logger: Logger
}

export interface CreateAssetOptions {
  asset: CreateAsset
  eventContext?: DomainEventContext
}

export interface UpdateAssetOwnerOptions {
  id: string
  ownerId: Asset["ownerId"]
  eventContext?: DomainEventContext
}

export interface DeleteAssetOptions {
  id: string
  eventContext?: DomainEventContext
}

export interface CreateAssetCustomFieldDefinitionOptions {
  definition: CreateAssetCustomFieldDefinition
  eventContext?: DomainEventContext
}

export interface UpdateAssetCustomFieldDefinitionOptions {
  id: string
  definition: CreateAssetCustomFieldDefinition
  eventContext?: DomainEventContext
}

export interface DeleteAssetCustomFieldDefinitionOptions {
  id: string
  eventContext?: DomainEventContext
}

export interface UpsertAssetCustomFieldValuesOptions {
  assetId: string
  values: UpdateAssetCustomFieldValue[]
  eventContext?: DomainEventContext
}

export interface ClearAssetCustomFieldValueOptions {
  assetId: string
  fieldId: string
  eventContext?: DomainEventContext
}

export interface AssignAssetCustomFieldsOptions {
  assetId: string
  fieldIds: string[]
  eventContext?: DomainEventContext
}

export interface DetachAssetCustomFieldOptions {
  assetId: string
  fieldId: string
  eventContext?: DomainEventContext
}

export function createAssetService({
  assetRepository,
  userProfileService,
  domainEventEmitter,
  logger
}: AssetServiceDependencies) {
  type AssetEventSubject = keyof AssetEventPayloads & string
  type CustomFieldEventSubject = keyof CustomFieldEventPayloads & string
  const emitAssetEvent = createDomainEventEmitter<AssetEventSubject>(
    domainEventEmitter,
    "asset"
  )
  const emitCustomFieldEvent =
    createDomainEventEmitter<CustomFieldEventSubject>(
      domainEventEmitter,
      "asset"
    )

  async function getAssetSnapshot(
    id: string
  ): Promise<AssetWithCustomFields | null> {
    return await assetRepository.getByIDWithCustomFields(id)
  }

  function emitUpdatedAssetEvent(
    previous: AssetWithCustomFields,
    current: AssetWithCustomFields,
    eventContext?: DomainEventContext
  ): void {
    if (assetSnapshotsEqual(previous, current)) {
      return
    }

    emitAssetEvent("asset.updated", { previous, current }, eventContext)
  }

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

    async listAllWithCustomFields(): Promise<AssetWithCustomFields[]> {
      try {
        return await assetRepository.listWithCustomFields()
      } catch (error) {
        logger.error(error, "failed to list assets with custom fields")
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

    async create(opts: CreateAssetOptions): Promise<Asset> {
      const { asset, eventContext } = opts

      try {
        if (asset.ownerId) {
          const owner = await userProfileService.getByID(asset.ownerId)

          if (!owner) {
            throw badRequest("asset owner does not exist")
          }
        }

        const created = await assetRepository.create({
          id: "",
          ownerId: null,
          ...asset
        })

        const createdSnapshot = await getAssetSnapshot(created.id)
        if (createdSnapshot) {
          emitAssetEvent(
            "asset.created",
            { asset: createdSnapshot },
            eventContext
          )
        }
        return created
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error
        }

        logger.error(error, `failed to create new asset ${asset.name}`)
        throw new HTTPException(500, {
          message: "failed to create asset"
        })
      }
    },

    async updateOwnerByID(
      opts: UpdateAssetOwnerOptions
    ): Promise<Asset | null> {
      const { id, ownerId, eventContext } = opts

      try {
        if (ownerId) {
          const owner = await userProfileService.getByID(ownerId)

          if (!owner) {
            throw badRequest("asset owner does not exist")
          }
        }

        const previous = await getAssetSnapshot(id)
        if (!previous) {
          logger.debug(`cannot update asset ${id} owner: not found`)
          return null
        }

        const updated = await assetRepository.updateOwnerByID(id, ownerId)
        if (!updated) {
          logger.debug(`cannot update asset ${id} owner: not found`)
          return null
        }

        const current = await getAssetSnapshot(id)
        if (current) {
          emitUpdatedAssetEvent(previous, current, eventContext)
        }
        return updated
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error
        }

        logger.error(error, `failed to update asset ${id} owner`)
        throw new HTTPException(500, {
          message: "failed to update asset owner"
        })
      }
    },

    async deleteByID(opts: DeleteAssetOptions): Promise<Asset | null> {
      const { id, eventContext } = opts

      try {
        const deletedSnapshot = await getAssetSnapshot(id)
        if (!deletedSnapshot) {
          logger.debug(`cannot delete asset ${id}: not found`)
          return null
        }

        const linkedFindingCount =
          await assetRepository.countFindingsByAssetID(id)
        if (linkedFindingCount > 0) {
          throw conflict(`asset ${id} is still referenced by findings`)
        }

        const asset = await assetRepository.deleteByID(id)
        if (!asset) {
          logger.debug(`cannot delete asset ${id}: not found`)
          return null
        }
        emitAssetEvent(
          "asset.deleted",
          { asset: deletedSnapshot },
          eventContext
        )
        return asset
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error
        }

        if (isForeignKeyError(error)) {
          logger.debug(error, "asset delete foreign key conflict")
          throw conflict(`asset ${id} is still referenced by findings`)
        }

        logger.error(error, `failed to delete asset with id ${id}`)
        throw new HTTPException(500, {
          message: "failed to delete asset"
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
      opts: CreateAssetCustomFieldDefinitionOptions
    ): Promise<AssetCustomFieldDefinition> {
      const { definition, eventContext } = opts
      validateCustomFieldDefinition(definition)

      try {
        const created =
          await assetRepository.createCustomFieldDefinition(definition)
        emitCustomFieldEvent(
          "custom-field.created",
          { customFieldDefinition: created },
          eventContext
        )
        return created
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
      opts: UpdateAssetCustomFieldDefinitionOptions
    ): Promise<AssetCustomFieldDefinition | null> {
      const { id, definition, eventContext } = opts
      validateCustomFieldDefinition(definition)

      try {
        const previous = await assetRepository.getCustomFieldDefinitionByID(id)
        if (!previous) {
          logger.debug(`asset custom field definition with id ${id} not found`)
          return null
        }

        const updated = await assetRepository.updateCustomFieldDefinitionByID(
          id,
          definition
        )
        if (!updated) {
          logger.debug(`asset custom field definition with id ${id} not found`)
          return null
        }

        if (!customFieldDefinitionsEqual(previous, updated)) {
          emitCustomFieldEvent(
            "custom-field.updated",
            { previous, current: updated },
            eventContext
          )
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
      opts: DeleteAssetCustomFieldDefinitionOptions
    ): Promise<AssetCustomFieldDefinition | null> {
      const { id, eventContext } = opts
      try {
        const deleted =
          await assetRepository.deleteCustomFieldDefinitionByID(id)
        if (!deleted) {
          logger.debug(`asset custom field definition with id ${id} not found`)
          return null
        }
        emitCustomFieldEvent(
          "custom-field.deleted",
          { customFieldDefinition: deleted },
          eventContext
        )
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
      opts: UpsertAssetCustomFieldValuesOptions
    ): Promise<AssetCustomFieldValue[] | null> {
      const { assetId, values, eventContext } = opts

      try {
        const previous = await getAssetSnapshot(assetId)
        if (!previous) {
          logger.debug(`asset with id ${assetId} not found`)
          return null
        }

        const definitions = await assetRepository.listCustomFieldDefinitions()
        const definitionsById = new Map(
          definitions.map((definition) => [definition.id, definition])
        )
        const assignedFieldIds = new Set(
          previous.customFields.map((value) => value.fieldId)
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

        const updatedValues = await assetRepository.upsertCustomFieldValues(
          assetId,
          values
        )
        const current = await getAssetSnapshot(assetId)
        if (current) {
          emitUpdatedAssetEvent(previous, current, eventContext)
        }
        return updatedValues
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
      opts: ClearAssetCustomFieldValueOptions
    ): Promise<boolean | null> {
      const { assetId, fieldId, eventContext } = opts

      try {
        const previous = await getAssetSnapshot(assetId)
        if (!previous) {
          logger.debug(`asset with id ${assetId} not found`)
          return null
        }

        const definition =
          await assetRepository.getCustomFieldDefinitionByID(fieldId)
        if (!definition) {
          throw badRequest(`unknown asset custom field id ${fieldId}`)
        }

        if (!previous.customFields.some((value) => value.fieldId === fieldId)) {
          throw badRequest("asset custom field is not assigned to asset")
        }

        await assetRepository.clearCustomFieldValue(assetId, fieldId)
        const current = await getAssetSnapshot(assetId)
        if (current) {
          emitUpdatedAssetEvent(previous, current, eventContext)
        }
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
      opts: AssignAssetCustomFieldsOptions
    ): Promise<AssetCustomFieldValue[] | null> {
      const { assetId, fieldIds, eventContext } = opts

      try {
        const previous = await getAssetSnapshot(assetId)
        if (!previous) {
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

        const values = await assetRepository.assignCustomFields(
          assetId,
          fieldIds
        )
        const current = await getAssetSnapshot(assetId)
        if (current) {
          emitUpdatedAssetEvent(previous, current, eventContext)
        }
        return values
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
      opts: DetachAssetCustomFieldOptions
    ): Promise<boolean | null> {
      const { assetId, fieldId, eventContext } = opts

      try {
        const previous = await getAssetSnapshot(assetId)
        if (!previous) {
          logger.debug(`asset with id ${assetId} not found`)
          return null
        }

        const definition =
          await assetRepository.getCustomFieldDefinitionByID(fieldId)
        if (!definition) {
          throw badRequest(`unknown asset custom field id ${fieldId}`)
        }

        await assetRepository.detachCustomField(assetId, fieldId)
        const current = await getAssetSnapshot(assetId)
        if (current) {
          emitUpdatedAssetEvent(previous, current, eventContext)
        }
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
