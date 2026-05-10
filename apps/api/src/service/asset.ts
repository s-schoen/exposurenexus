import {
  type Asset,
  type AssetWithCustomFields,
  AssetType,
  type CreateAsset
} from "@exposurenexus/types/model/asset"
import {
  type AssetCustomFieldDefinition,
  type AssetCustomFieldValue,
  type AssetCustomFieldValueLiteral,
  AssetCustomFieldType,
  type UpdateAssetCustomFieldValue
} from "@exposurenexus/types/model/asset-custom-field"
import type { Logger } from "pino"
import type { UserProfile } from "@exposurenexus/types/model/user"
import { ApplicationError, isApplicationError } from "./application-error.js"
import { isForeignKeyError } from "./errors.js"
import {
  createDomainEventEmitter,
  type AssetEventPayloads,
  type DomainEventContext,
  type DomainEventEmitter
} from "../lib/eventbus/events/index.js"
import type { AssetRepository } from "../repository/asset.js"

function isValidValueForDefinition(
  definition: AssetCustomFieldDefinition | AssetCustomFieldValue,
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

interface UserProfileLookupService {
  getByID(id: string): Promise<UserProfile | null>
}

interface AssetServiceDependencies {
  assetRepository: AssetRepository
  userProfileService: UserProfileLookupService
  domainEventEmitter: DomainEventEmitter
  logger: Logger
}

export interface UpdateAssetOwnerOptions {
  id: string
  ownerId: Asset["ownerId"]
  eventContext?: DomainEventContext
}

export interface ReplaceAssetCustomFieldValuesOptions {
  assetId: string
  values: UpdateAssetCustomFieldValue[]
  eventContext?: DomainEventContext
}

export interface ReplaceAssetCustomFieldAssociationsOptions {
  assetId: string
  fieldIds: string[]
  eventContext?: DomainEventContext
}

export interface AssetService {
  listAll(): Promise<Asset[]>
  listAllWithCustomFields(): Promise<AssetWithCustomFields[]>
  getByID(id: string): Promise<Asset | null>
  getByName(name: string, type?: AssetType): Promise<Asset | null>
  create(asset: CreateAsset, eventContext?: DomainEventContext): Promise<Asset>
  updateOwnerByID(opts: UpdateAssetOwnerOptions): Promise<Asset | null>
  deleteByID(
    id: string,
    eventContext?: DomainEventContext
  ): Promise<Asset | null>
  listCustomFieldValues(
    assetId: string
  ): Promise<AssetCustomFieldValue[] | null>
  listAvailableCustomFieldDefinitions(
    assetId: string
  ): Promise<AssetCustomFieldDefinition[] | null>
  replaceCustomFieldValues(
    opts: ReplaceAssetCustomFieldValuesOptions
  ): Promise<AssetCustomFieldValue[] | null>
  replaceCustomFieldAssociations(
    opts: ReplaceAssetCustomFieldAssociationsOptions
  ): Promise<AssetCustomFieldValue[] | null>
}

export function createAssetService({
  assetRepository,
  userProfileService,
  domainEventEmitter,
  logger
}: AssetServiceDependencies): AssetService {
  type AssetEventSubject = keyof AssetEventPayloads & string
  const emitAssetEvent = createDomainEventEmitter<AssetEventSubject>(
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
        throw new ApplicationError({
          code: "asset.list_failed",
          kind: "unexpected",
          message: "failed to list assets",
          cause: error
        })
      }
    },

    async listAllWithCustomFields(): Promise<AssetWithCustomFields[]> {
      try {
        return await assetRepository.listWithCustomFields()
      } catch (error) {
        logger.error(error, "failed to list assets with custom fields")
        throw new ApplicationError({
          code: "asset.list_with_custom_fields_failed",
          kind: "unexpected",
          message: "failed to list assets",
          cause: error
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
        throw new ApplicationError({
          code: "asset.get_failed",
          kind: "unexpected",
          message: "failed to get asset",
          cause: error,
          details: { assetId: id }
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
        throw new ApplicationError({
          code: "asset.get_by_name_failed",
          kind: "unexpected",
          message: "failed to get asset",
          cause: error,
          details: { assetName: name, assetType: type }
        })
      }
    },

    async create(
      asset: CreateAsset,
      eventContext?: DomainEventContext
    ): Promise<Asset> {
      try {
        if (asset.ownerId) {
          const owner = await userProfileService.getByID(asset.ownerId)

          if (!owner) {
            throw new ApplicationError({
              code: "asset.owner_unknown",
              kind: "validation",
              message: "asset owner does not exist",
              details: { ownerId: asset.ownerId }
            })
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
        if (isApplicationError(error)) {
          throw error
        }

        logger.error(error, `failed to create new asset ${asset.name}`)
        throw new ApplicationError({
          code: "asset.create_failed",
          kind: "unexpected",
          message: "failed to create asset",
          cause: error,
          details: { assetName: asset.name, assetType: asset.type }
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
            throw new ApplicationError({
              code: "asset.owner_unknown",
              kind: "validation",
              message: "asset owner does not exist",
              details: { ownerId }
            })
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
        if (isApplicationError(error)) {
          throw error
        }

        logger.error(error, `failed to update asset ${id} owner`)
        throw new ApplicationError({
          code: "asset.owner_update_failed",
          kind: "unexpected",
          message: "failed to update asset owner",
          cause: error,
          details: { assetId: id }
        })
      }
    },

    async deleteByID(
      id: string,
      eventContext?: DomainEventContext
    ): Promise<Asset | null> {
      try {
        const deletedSnapshot = await getAssetSnapshot(id)
        if (!deletedSnapshot) {
          logger.debug(`cannot delete asset ${id}: not found`)
          return null
        }

        const linkedFindingCount =
          await assetRepository.countFindingsByAssetID(id)
        if (linkedFindingCount > 0) {
          throw new ApplicationError({
            code: "asset.delete_referenced_by_findings",
            kind: "conflict",
            message: `asset ${id} is still referenced by findings`,
            details: { assetId: id }
          })
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
        if (isApplicationError(error)) {
          throw error
        }

        if (isForeignKeyError(error)) {
          logger.debug(error, "asset delete foreign key conflict")
          throw new ApplicationError({
            code: "asset.delete_referenced_by_findings",
            kind: "conflict",
            message: `asset ${id} is still referenced by findings`,
            cause: error,
            details: { assetId: id }
          })
        }

        logger.error(error, `failed to delete asset with id ${id}`)
        throw new ApplicationError({
          code: "asset.delete_failed",
          kind: "unexpected",
          message: "failed to delete asset",
          cause: error,
          details: { assetId: id }
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
        throw new ApplicationError({
          code: "asset.custom_field_value.list_failed",
          kind: "unexpected",
          message: "failed to list asset custom field values",
          cause: error,
          details: { assetId }
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
        throw new ApplicationError({
          code: "asset.custom_field_definition.list_available_failed",
          kind: "unexpected",
          message: "failed to list available asset custom fields",
          cause: error,
          details: { assetId }
        })
      }
    },

    async replaceCustomFieldValues(
      opts: ReplaceAssetCustomFieldValuesOptions
    ): Promise<AssetCustomFieldValue[] | null> {
      const { assetId, values, eventContext } = opts

      try {
        const previous = await getAssetSnapshot(assetId)
        if (!previous) {
          logger.debug(`asset with id ${assetId} not found`)
          return null
        }

        const duplicateFieldId = findDuplicate(
          values.map((value) => value.fieldId)
        )
        if (duplicateFieldId) {
          throw new ApplicationError({
            code: "asset.custom_field_value.duplicate",
            kind: "validation",
            message: "asset custom field values contain duplicate fields",
            details: { assetId, fieldId: duplicateFieldId }
          })
        }

        const fieldsById = new Map(
          previous.customFields.map((field) => [field.fieldId, field])
        )
        const submittedFieldIds = new Set(values.map((value) => value.fieldId))

        for (const assignedFieldId of fieldsById.keys()) {
          if (!submittedFieldIds.has(assignedFieldId)) {
            throw new ApplicationError({
              code: "asset.custom_field_value.missing",
              kind: "validation",
              message: "asset custom field value replacement is incomplete",
              details: { assetId, fieldId: assignedFieldId }
            })
          }
        }

        for (const valueUpdate of values) {
          const field = fieldsById.get(valueUpdate.fieldId)

          if (!field) {
            throw new ApplicationError({
              code: "asset.custom_field.not_assigned",
              kind: "validation",
              message: "asset custom field is not assigned to asset",
              details: { assetId, fieldId: valueUpdate.fieldId }
            })
          }

          if (
            valueUpdate.value !== null &&
            !isValidValueForDefinition(field, valueUpdate.value)
          ) {
            throw new ApplicationError({
              code: "asset.custom_field_value.invalid",
              kind: "validation",
              message: `invalid value for asset custom field ${field.key}`,
              details: {
                assetId,
                fieldId: valueUpdate.fieldId,
                fieldKey: field.key
              }
            })
          }
        }

        const updatedValues = await assetRepository.replaceCustomFieldValues(
          assetId,
          values
        )
        const current = await getAssetSnapshot(assetId)
        if (current) {
          emitUpdatedAssetEvent(previous, current, eventContext)
        }
        return updatedValues
      } catch (error) {
        if (isApplicationError(error)) {
          throw error
        }

        logger.error(
          error,
          `failed to replace asset custom field values for asset ${assetId}`
        )
        throw new ApplicationError({
          code: "asset.custom_field_value.replace_failed",
          kind: "unexpected",
          message: "failed to update asset custom field values",
          cause: error,
          details: { assetId }
        })
      }
    },

    async replaceCustomFieldAssociations(
      opts: ReplaceAssetCustomFieldAssociationsOptions
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
            code: "asset.custom_field_assignment.duplicate",
            kind: "validation",
            message: "asset custom field associations contain duplicate fields",
            details: { assetId, fieldId: duplicateFieldId }
          })
        }

        const definitions = await assetRepository.listCustomFieldDefinitions()
        const definitionIds = new Set(
          definitions.map((definition) => definition.id)
        )

        for (const fieldId of fieldIds) {
          if (!definitionIds.has(fieldId)) {
            throw new ApplicationError({
              code: "asset.custom_field.unknown",
              kind: "validation",
              message: `unknown asset custom field id ${fieldId}`,
              details: { fieldId }
            })
          }
        }

        const values = await assetRepository.replaceCustomFieldAssociations(
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
          `failed to replace asset custom field associations for asset ${assetId}`
        )
        throw new ApplicationError({
          code: "asset.custom_field_assignment.replace_failed",
          kind: "unexpected",
          message: "failed to replace asset custom field associations",
          cause: error,
          details: { assetId }
        })
      }
    }
  }
}
