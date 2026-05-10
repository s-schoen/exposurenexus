import {
  type AssetCustomFieldDefinition,
  type AssetCustomFieldRuleViolation,
  AssetCustomFieldRuleViolationReason,
  type CreateAssetCustomFieldDefinition,
  type UpdateAssetCustomFieldDefinition,
  validateAssetCustomFieldDefinitionRules
} from "@exposurenexus/types/model/asset-custom-field"
import type { Logger } from "pino"
import { ApplicationError } from "./application-error.js"
import { isConflictError } from "./errors.js"
import {
  createDomainEventEmitter,
  type CustomFieldEventPayloads,
  type DomainEventContext,
  type DomainEventEmitter
} from "../lib/eventbus/events/index.js"
import type { AssetCustomFieldRepository } from "../repository/asset-custom-field.js"

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

interface AssetCustomFieldServiceDependencies {
  assetCustomFieldRepository: AssetCustomFieldRepository
  domainEventEmitter: DomainEventEmitter
  logger: Logger
}

export interface UpdateAssetCustomFieldDefinitionOptions {
  id: string
  definition: UpdateAssetCustomFieldDefinition
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
}

export function createAssetCustomFieldService({
  assetCustomFieldRepository,
  domainEventEmitter,
  logger
}: AssetCustomFieldServiceDependencies): AssetCustomFieldService {
  type CustomFieldEventSubject = keyof CustomFieldEventPayloads & string
  const emitCustomFieldEvent =
    createDomainEventEmitter<CustomFieldEventSubject>(
      domainEventEmitter,
      "asset-custom-field"
    )

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
    }
  }
}
