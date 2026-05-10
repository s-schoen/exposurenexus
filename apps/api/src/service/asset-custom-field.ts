import {
  type AssetCustomFieldDefinition,
  type AssetCustomFieldRuleViolation,
  type AssetCustomFieldValue,
  AssetCustomFieldRuleViolationReason,
  type CreateAssetCustomFieldDefinition,
  type UpdateAssetCustomFieldDefinition,
  validateAssetCustomFieldDefinitionRules
} from "@exposurenexus/types/model/asset-custom-field"
import type {
  Asset,
  AssetWithCustomFields
} from "@exposurenexus/types/model/asset"
import type { Logger } from "pino"
import { ApplicationError, isApplicationError } from "./application-error.js"
import { isConflictError } from "./errors.js"
import {
  createDomainEventEmitter,
  type AssetEventPayloads,
  type CustomFieldEventPayloads,
  type DomainEventContext,
  type DomainEventEmitter
} from "../lib/eventbus/events/index.js"
import type { AssetCustomFieldRepository } from "../repository/asset-custom-field.js"

interface AssetLookupRepository {
  getByID(id: string): Promise<Asset | null>
}

function customFieldRuleViolationMessage(
  violation: AssetCustomFieldRuleViolation
): string {
  switch (violation.reason) {
    case AssetCustomFieldRuleViolationReason.RequiredDefaultMissing:
      return "required asset custom fields must define a default value"
    case AssetCustomFieldRuleViolationReason.TextDefaultMustBeString:
      return "text asset custom field default must be a string"
    case AssetCustomFieldRuleViolationReason.NumberDefaultMustBeNumber:
      return "number asset custom field default must be a number"
    case AssetCustomFieldRuleViolationReason.SelectDefaultMustBeString:
      return "select asset custom field default must be a string"
    case AssetCustomFieldRuleViolationReason.SelectDefaultMustMatchOption:
      return "select asset custom field default must match an option value"
    case AssetCustomFieldRuleViolationReason.SelectOptionValuesMustBeUnique:
      return "select asset custom field options must be unique"
  }
}

function validateCustomFieldDefinition(
  definition:
    | CreateAssetCustomFieldDefinition
    | UpdateAssetCustomFieldDefinition
): void {
  const [violation] = validateAssetCustomFieldDefinitionRules(definition)

  if (violation) {
    throw new ApplicationError({
      code: "asset_custom_field.definition.rule_violation",
      kind: "validation",
      message: customFieldRuleViolationMessage(violation),
      cause: violation,
      details: violation
    })
  }
}

function customFieldDefinitionsEqual(
  previous: AssetCustomFieldDefinition,
  current: AssetCustomFieldDefinition
): boolean {
  return JSON.stringify(previous) === JSON.stringify(current)
}

function assetSnapshotsEqual(
  previous: AssetWithCustomFields,
  current: AssetWithCustomFields
): boolean {
  return JSON.stringify(previous) === JSON.stringify(current)
}

function findDuplicate(values: readonly string[]): string | null {
  const seen = new Set<string>()

  for (const value of values) {
    if (seen.has(value)) {
      return value
    }
    seen.add(value)
  }

  return null
}

interface AssetCustomFieldServiceDependencies {
  assetCustomFieldRepository: AssetCustomFieldRepository
  assetRepository: AssetLookupRepository
  domainEventEmitter: DomainEventEmitter
  logger: Logger
}

export interface UpdateAssetCustomFieldDefinitionOptions {
  id: string
  definition: UpdateAssetCustomFieldDefinition
  eventContext?: DomainEventContext
}

export interface ReplaceAssetCustomFieldAssignmentsOptions {
  assetId: string
  fieldIds: string[]
  eventContext?: DomainEventContext
}

export interface AssetCustomFieldService {
  listDefinitions(): Promise<AssetCustomFieldDefinition[]>
  getDefinitionByID(id: string): Promise<AssetCustomFieldDefinition | null>
  createDefinition(
    definition: CreateAssetCustomFieldDefinition,
    eventContext?: DomainEventContext
  ): Promise<AssetCustomFieldDefinition>
  updateDefinitionByID(
    opts: UpdateAssetCustomFieldDefinitionOptions
  ): Promise<AssetCustomFieldDefinition | null>
  deleteDefinitionByID(
    id: string,
    eventContext?: DomainEventContext
  ): Promise<AssetCustomFieldDefinition | null>
  listEffectiveValuesForAsset(
    assetId: string
  ): Promise<AssetCustomFieldValue[] | null>
  listEffectiveValuesForAssets(
    assetIds: readonly string[]
  ): Promise<Map<string, AssetCustomFieldValue[]>>
  listAvailableDefinitionsForAsset(
    assetId: string
  ): Promise<AssetCustomFieldDefinition[] | null>
  replaceAssignmentsForAsset(
    opts: ReplaceAssetCustomFieldAssignmentsOptions
  ): Promise<AssetCustomFieldValue[] | null>
}

export function createAssetCustomFieldService({
  assetCustomFieldRepository,
  assetRepository,
  domainEventEmitter,
  logger
}: AssetCustomFieldServiceDependencies): AssetCustomFieldService {
  type CustomFieldEventSubject = keyof CustomFieldEventPayloads & string
  const emitCustomFieldEvent =
    createDomainEventEmitter<CustomFieldEventSubject>(
      domainEventEmitter,
      "asset-custom-field"
    )
  type AssetEventSubject = keyof AssetEventPayloads & string
  const emitAssetEvent = createDomainEventEmitter<AssetEventSubject>(
    domainEventEmitter,
    "asset"
  )

  async function getAssetSnapshot(
    assetId: string
  ): Promise<AssetWithCustomFields | null> {
    const asset = await assetRepository.getByID(assetId)
    if (!asset) {
      return null
    }

    return {
      ...asset,
      customFields:
        await assetCustomFieldRepository.listEffectiveValuesForAsset(assetId)
    }
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
    async listDefinitions(): Promise<AssetCustomFieldDefinition[]> {
      try {
        return await assetCustomFieldRepository.listDefinitions()
      } catch (error) {
        logger.error(error, "failed to list asset custom field definitions")
        throw new ApplicationError({
          code: "asset_custom_field.definition.list_failed",
          kind: "unexpected",
          message: "failed to list asset custom field definitions",
          cause: error
        })
      }
    },

    async getDefinitionByID(
      id: string
    ): Promise<AssetCustomFieldDefinition | null> {
      try {
        const definition =
          await assetCustomFieldRepository.getDefinitionByID(id)
        if (!definition) {
          logger.debug(`asset custom field definition with id ${id} not found`)
        }
        return definition
      } catch (error) {
        logger.error(
          error,
          `failed to get asset custom field definition with id ${id}`
        )
        throw new ApplicationError({
          code: "asset_custom_field.definition.get_failed",
          kind: "unexpected",
          message: "failed to get asset custom field definition",
          cause: error,
          details: { fieldId: id }
        })
      }
    },

    async createDefinition(
      definition: CreateAssetCustomFieldDefinition,
      eventContext?: DomainEventContext
    ): Promise<AssetCustomFieldDefinition> {
      validateCustomFieldDefinition(definition)

      try {
        const created =
          await assetCustomFieldRepository.createDefinition(definition)
        emitCustomFieldEvent(
          "custom-field.created",
          { customFieldDefinition: created },
          eventContext
        )
        return created
      } catch (error) {
        if (isConflictError(error)) {
          logger.debug(error, "asset custom field definition create conflict")
          throw new ApplicationError({
            code: "asset_custom_field.definition.create_conflict",
            kind: "conflict",
            message: "asset custom field definition already exists",
            cause: error,
            details: { fieldKey: definition.key }
          })
        }

        logger.error(
          error,
          `failed to create asset custom field definition ${definition.key}`
        )
        throw new ApplicationError({
          code: "asset_custom_field.definition.create_failed",
          kind: "unexpected",
          message: "failed to create asset custom field definition",
          cause: error,
          details: { fieldKey: definition.key }
        })
      }
    },

    async updateDefinitionByID(
      opts: UpdateAssetCustomFieldDefinitionOptions
    ): Promise<AssetCustomFieldDefinition | null> {
      const { id, definition, eventContext } = opts
      validateCustomFieldDefinition(definition)

      try {
        const previous = await assetCustomFieldRepository.getDefinitionByID(id)
        if (!previous) {
          logger.debug(`asset custom field definition with id ${id} not found`)
          return null
        }

        const updated = await assetCustomFieldRepository.updateDefinitionByID(
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
          throw new ApplicationError({
            code: "asset_custom_field.definition.update_conflict",
            kind: "conflict",
            message: "asset custom field definition already exists",
            cause: error,
            details: { fieldId: id, fieldKey: definition.key }
          })
        }

        logger.error(
          error,
          `failed to update asset custom field definition with id ${id}`
        )
        throw new ApplicationError({
          code: "asset_custom_field.definition.update_failed",
          kind: "unexpected",
          message: "failed to update asset custom field definition",
          cause: error,
          details: { fieldId: id }
        })
      }
    },

    async deleteDefinitionByID(
      id: string,
      eventContext?: DomainEventContext
    ): Promise<AssetCustomFieldDefinition | null> {
      try {
        const deleted =
          await assetCustomFieldRepository.deleteDefinitionByID(id)
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
        throw new ApplicationError({
          code: "asset_custom_field.definition.delete_failed",
          kind: "unexpected",
          message: "failed to delete asset custom field definition",
          cause: error,
          details: { fieldId: id }
        })
      }
    },

    async listEffectiveValuesForAsset(
      assetId: string
    ): Promise<AssetCustomFieldValue[] | null> {
      try {
        const asset = await assetRepository.getByID(assetId)
        if (!asset) {
          logger.debug(`asset with id ${assetId} not found`)
          return null
        }

        return await assetCustomFieldRepository.listEffectiveValuesForAsset(
          assetId
        )
      } catch (error) {
        logger.error(
          error,
          `failed to list asset custom field values for asset ${assetId}`
        )
        throw new ApplicationError({
          code: "asset_custom_field.value.list_failed",
          kind: "unexpected",
          message: "failed to list asset custom field values",
          cause: error,
          details: { assetId }
        })
      }
    },

    async listEffectiveValuesForAssets(
      assetIds: readonly string[]
    ): Promise<Map<string, AssetCustomFieldValue[]>> {
      try {
        return await assetCustomFieldRepository.listEffectiveValuesForAssets(
          assetIds
        )
      } catch (error) {
        logger.error(error, "failed to hydrate asset custom field values")
        throw new ApplicationError({
          code: "asset_custom_field.value.list_for_assets_failed",
          kind: "unexpected",
          message: "failed to hydrate asset custom field values",
          cause: error,
          details: { assetIds: [...assetIds] }
        })
      }
    },

    async listAvailableDefinitionsForAsset(
      assetId: string
    ): Promise<AssetCustomFieldDefinition[] | null> {
      try {
        const asset = await assetRepository.getByID(assetId)
        if (!asset) {
          logger.debug(`asset with id ${assetId} not found`)
          return null
        }

        return await assetCustomFieldRepository.listAvailableDefinitionsForAsset(
          assetId
        )
      } catch (error) {
        logger.error(
          error,
          `failed to list available asset custom fields for asset ${assetId}`
        )
        throw new ApplicationError({
          code: "asset_custom_field.definition.list_available_failed",
          kind: "unexpected",
          message: "failed to list available asset custom fields",
          cause: error,
          details: { assetId }
        })
      }
    },

    async replaceAssignmentsForAsset(
      opts: ReplaceAssetCustomFieldAssignmentsOptions
    ): Promise<AssetCustomFieldValue[] | null> {
      const { assetId, fieldIds, eventContext } = opts

      try {
        const previous = await getAssetSnapshot(assetId)
        if (!previous) {
          logger.debug(`asset with id ${assetId} not found`)
          return null
        }

        const duplicateFieldId = findDuplicate(fieldIds)
        if (duplicateFieldId) {
          throw new ApplicationError({
            code: "asset_custom_field.assignment.duplicate",
            kind: "validation",
            message: "asset custom field assignments contain duplicate fields",
            details: { assetId, fieldId: duplicateFieldId }
          })
        }

        const definitions = await assetCustomFieldRepository.listDefinitions()
        const definitionIds = new Set(
          definitions.map((definition) => definition.id)
        )

        for (const fieldId of fieldIds) {
          if (!definitionIds.has(fieldId)) {
            throw new ApplicationError({
              code: "asset_custom_field.definition.unknown",
              kind: "validation",
              message: "unknown asset custom field",
              details: { fieldId }
            })
          }
        }

        const values =
          await assetCustomFieldRepository.replaceAssignmentsForAsset(
            assetId,
            fieldIds
          )
        const current = await getAssetSnapshot(assetId)
        if (current) {
          emitUpdatedAssetEvent(previous, current, eventContext)
        }
        return values
      } catch (error) {
        if (isApplicationError(error)) {
          throw error
        }

        logger.error(
          error,
          `failed to replace asset custom field assignments for asset ${assetId}`
        )
        throw new ApplicationError({
          code: "asset_custom_field.assignment.replace_failed",
          kind: "unexpected",
          message: "failed to replace asset custom field assignments",
          cause: error,
          details: { assetId }
        })
      }
    }
  }
}
