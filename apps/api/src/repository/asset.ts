import {
  type AssetCustomFieldDefinition,
  type AssetCustomFieldOption,
  type AssetCustomFieldValue,
  AssetCustomFieldValueSource,
  AssetCustomFieldType,
  type UpdateAssetCustomFieldValue
} from "@exposurenexus/types/model/asset-custom-field"
import { type Asset, AssetType } from "@exposurenexus/types/model/asset"
import { type Database } from "../db/index.js"
import {
  sql,
  type Kysely,
  type RawBuilder,
  type Selectable,
  type Transaction
} from "kysely"
import type { AssetCustomFieldStoredValue } from "../db/schema/asset-custom-field.js"

type DatabaseExecutor = Kysely<Database> | Transaction<Database>
type AssetCustomFieldRow = Selectable<Database["asset_custom_field"]>
export type CreateAssetRecord = Omit<Asset, "ownerId"> & {
  ownerId?: Asset["ownerId"]
}

export interface AssetRepository {
  list(): Promise<Asset[]>
  getByID(id: string): Promise<Asset | null>
  getByName(name: string, type?: AssetType): Promise<Asset | null>
  create(asset: CreateAssetRecord): Promise<Asset>
  updateOwnerByID(id: string, ownerId: Asset["ownerId"]): Promise<Asset | null>
  deleteByID(id: string): Promise<Asset | null>
  countFindingsByAssetID(id: string): Promise<number>
  replaceCustomFieldValues(
    assetId: string,
    values: UpdateAssetCustomFieldValue[]
  ): Promise<AssetCustomFieldValue[]>
}

function toJsonbValue(
  value: AssetCustomFieldStoredValue
): RawBuilder<AssetCustomFieldStoredValue> {
  return sql`${JSON.stringify(value)}::jsonb`
}

function toOptionsByFieldId(
  options: AssetCustomFieldOption[]
): Map<string, AssetCustomFieldOption[]> {
  const optionsByFieldId = new Map<string, AssetCustomFieldOption[]>()

  for (const option of options) {
    const fieldOptions = optionsByFieldId.get(option.fieldId) ?? []
    fieldOptions.push(option)
    optionsByFieldId.set(option.fieldId, fieldOptions)
  }

  return optionsByFieldId
}

function toCustomFieldDefinition(
  field: AssetCustomFieldRow,
  options: AssetCustomFieldOption[] = []
): AssetCustomFieldDefinition {
  switch (field.type) {
    case AssetCustomFieldType.Text:
      return {
        id: field.id,
        key: field.key,
        name: field.name,
        required: field.required,
        type: field.type,
        defaultValue: field.defaultValue as string | null
      }
    case AssetCustomFieldType.Number:
      return {
        id: field.id,
        key: field.key,
        name: field.name,
        required: field.required,
        type: field.type,
        defaultValue: field.defaultValue as number | null
      }
    case AssetCustomFieldType.Select:
      return {
        id: field.id,
        key: field.key,
        name: field.name,
        required: field.required,
        type: field.type,
        defaultValue: field.defaultValue as string | null,
        options
      }
  }
}

function toCustomFieldValue(
  definition: AssetCustomFieldDefinition,
  override: AssetCustomFieldStoredValue | null | undefined
): AssetCustomFieldValue {
  const hasOverride = override !== undefined
  const value = hasOverride ? override : definition.defaultValue
  const source = hasOverride
    ? AssetCustomFieldValueSource.Asset
    : definition.defaultValue !== null
      ? AssetCustomFieldValueSource.Default
      : AssetCustomFieldValueSource.Empty

  switch (definition.type) {
    case AssetCustomFieldType.Text:
      return {
        fieldId: definition.id,
        key: definition.key,
        name: definition.name,
        source,
        type: definition.type,
        value: value as string | null
      }
    case AssetCustomFieldType.Number:
      return {
        fieldId: definition.id,
        key: definition.key,
        name: definition.name,
        source,
        type: definition.type,
        value: value as number | null
      }
    case AssetCustomFieldType.Select:
      return {
        fieldId: definition.id,
        key: definition.key,
        name: definition.name,
        source,
        type: definition.type,
        value: value as string | null,
        options: definition.options
      }
  }
}

async function listCustomFieldOptions(
  database: DatabaseExecutor,
  fieldIds: readonly string[]
): Promise<AssetCustomFieldOption[]> {
  if (fieldIds.length === 0) {
    return []
  }

  return await database
    .selectFrom("asset_custom_field_option")
    .selectAll()
    .where("fieldId", "in", [...fieldIds])
    .orderBy("value", "asc")
    .execute()
}

async function listAssignedCustomFieldDefinitions(
  database: DatabaseExecutor,
  assetId: string
): Promise<AssetCustomFieldDefinition[]> {
  const fields = await database
    .selectFrom("asset_custom_field_assignment")
    .innerJoin(
      "asset_custom_field",
      "asset_custom_field.id",
      "asset_custom_field_assignment.fieldId"
    )
    .selectAll("asset_custom_field")
    .where("asset_custom_field_assignment.assetId", "=", assetId)
    .orderBy("asset_custom_field.key", "asc")
    .execute()
  const optionsByFieldId = toOptionsByFieldId(
    await listCustomFieldOptions(
      database,
      fields.map((field) => field.id)
    )
  )

  return fields.map((field) =>
    toCustomFieldDefinition(field, optionsByFieldId.get(field.id) ?? [])
  )
}

export function createAssetRepository(
  database: Kysely<Database>
): AssetRepository {
  return {
    async list(): Promise<Asset[]> {
      const data = await database.selectFrom("asset").selectAll().execute()
      return Promise.resolve(data)
    },

    async getByID(id: string): Promise<Asset | null> {
      const assets = await database
        .selectFrom("asset")
        .selectAll()
        .where("id", "=", id)
        .execute()

      if (assets.length === 0) {
        return null
      }
      return assets[0]
    },

    async getByName(name: string, type?: AssetType): Promise<Asset | null> {
      let query = database
        .selectFrom("asset")
        .selectAll()
        .where("name", "=", name)
      if (type) {
        query = query.where("type", "=", type)
      }

      const asset = await query.executeTakeFirst()
      return asset || null
    },

    async create(asset: CreateAssetRecord): Promise<Asset> {
      const createdAsset = await database
        .insertInto("asset")
        .values({
          name: asset.name,
          type: asset.type,
          ownerId: asset.ownerId ?? null
        })
        .returningAll()
        .executeTakeFirst()

      return createdAsset!
    },

    async updateOwnerByID(
      id: string,
      ownerId: Asset["ownerId"]
    ): Promise<Asset | null> {
      const updatedAsset = await database
        .updateTable("asset")
        .set({
          ownerId
        })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst()

      return updatedAsset ?? null
    },

    async deleteByID(id: string): Promise<Asset | null> {
      const deletedAsset = await database
        .deleteFrom("asset")
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst()

      if (!deletedAsset) {
        return null
      }
      return deletedAsset
    },

    async countFindingsByAssetID(id: string): Promise<number> {
      const result = await database
        .selectFrom("finding")
        .select(database.fn.countAll().as("count"))
        .where("assetId", "=", id)
        .executeTakeFirst()

      return Number(result?.count ?? 0)
    },

    async replaceCustomFieldValues(
      assetId: string,
      values: UpdateAssetCustomFieldValue[]
    ): Promise<AssetCustomFieldValue[]> {
      return await database.transaction().execute(async (trx) => {
        await trx
          .deleteFrom("asset_custom_field_value")
          .where("assetId", "=", assetId)
          .execute()

        for (const value of values) {
          if (value.value === null) {
            continue
          }

          await trx
            .insertInto("asset_custom_field_value")
            .values({
              assetId,
              fieldId: value.fieldId,
              value: toJsonbValue(value.value)
            })
            .onConflict((oc) =>
              oc.columns(["assetId", "fieldId"]).doUpdateSet({
                value: toJsonbValue(value.value!)
              })
            )
            .execute()
        }

        const definitions = await listAssignedCustomFieldDefinitions(
          trx,
          assetId
        )
        const overrides = await trx
          .selectFrom("asset_custom_field_value")
          .select(["fieldId", "value"])
          .where("assetId", "=", assetId)
          .execute()
        const overridesByFieldId = new Map(
          overrides.map((override) => [override.fieldId, override.value])
        )

        return definitions.map((definition) =>
          toCustomFieldValue(definition, overridesByFieldId.get(definition.id))
        )
      })
    }
  }
}
