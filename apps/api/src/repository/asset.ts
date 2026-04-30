import {
  type Asset,
  type AssetCustomFieldDefinition,
  type AssetCustomFieldOption,
  type AssetCustomFieldValue,
  type AssetCustomFieldValueLiteral,
  AssetCustomFieldValueSource,
  type AssetWithCustomFields,
  type CreateAssetCustomFieldDefinition,
  AssetCustomFieldType,
  AssetType,
  type UpdateAssetCustomFieldValue
} from "@openvlp/types/model/asset"
import { type Database } from "../db/index.js"
import {
  sql,
  type Kysely,
  type RawBuilder,
  type Selectable,
  type Transaction
} from "kysely"
import type { AssetCustomFieldStoredValue } from "../db/schema/asset.js"

type DatabaseExecutor = Kysely<Database> | Transaction<Database>
type AssetCustomFieldRow = Selectable<Database["asset_custom_field"]>
type AssetCustomFieldAssignmentDefinitionRow = AssetCustomFieldRow & {
  assetId: string
}

function toJsonbValue(
  value: AssetCustomFieldStoredValue
): RawBuilder<AssetCustomFieldStoredValue> {
  return sql`${JSON.stringify(value)}::jsonb`
}

function toNullableJsonbValue(
  value: AssetCustomFieldValueLiteral | undefined
): RawBuilder<AssetCustomFieldStoredValue> | null {
  if (value === null || value === undefined) {
    return null
  }

  return toJsonbValue(value)
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

async function listCustomFieldDefinitions(
  database: DatabaseExecutor
): Promise<AssetCustomFieldDefinition[]> {
  const fields = await database
    .selectFrom("asset_custom_field")
    .selectAll()
    .orderBy("key", "asc")
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

async function listAssignedCustomFieldDefinitionsByAssetId(
  database: DatabaseExecutor,
  assetIds: readonly string[]
): Promise<Map<string, AssetCustomFieldDefinition[]>> {
  const definitionsByAssetId = new Map<string, AssetCustomFieldDefinition[]>()

  if (assetIds.length === 0) {
    return definitionsByAssetId
  }

  const fields = await database
    .selectFrom("asset_custom_field_assignment")
    .innerJoin(
      "asset_custom_field",
      "asset_custom_field.id",
      "asset_custom_field_assignment.fieldId"
    )
    .selectAll("asset_custom_field")
    .select("asset_custom_field_assignment.assetId")
    .where("asset_custom_field_assignment.assetId", "in", [...assetIds])
    .orderBy("asset_custom_field.key", "asc")
    .execute()
  const optionsByFieldId = toOptionsByFieldId(
    await listCustomFieldOptions(
      database,
      fields.map((field) => field.id)
    )
  )

  for (const field of fields as AssetCustomFieldAssignmentDefinitionRow[]) {
    const definitions = definitionsByAssetId.get(field.assetId) ?? []
    definitions.push(
      toCustomFieldDefinition(field, optionsByFieldId.get(field.id) ?? [])
    )
    definitionsByAssetId.set(field.assetId, definitions)
  }

  return definitionsByAssetId
}

async function getCustomFieldDefinitionByID(
  database: DatabaseExecutor,
  id: string
): Promise<AssetCustomFieldDefinition | null> {
  const field = await database
    .selectFrom("asset_custom_field")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst()

  if (!field) {
    return null
  }

  const options = await listCustomFieldOptions(database, [id])
  return toCustomFieldDefinition(field, options)
}

async function insertCustomFieldOptions(
  database: DatabaseExecutor,
  fieldId: string,
  definition: CreateAssetCustomFieldDefinition
): Promise<void> {
  if (definition.type !== AssetCustomFieldType.Select) {
    return
  }

  await database
    .insertInto("asset_custom_field_option")
    .values(
      definition.options.map((option) => ({
        fieldId,
        value: option.value,
        label: option.label
      }))
    )
    .execute()
}

export function createAssetRepository(database: Kysely<Database>) {
  return {
    async list(): Promise<Asset[]> {
      const data = await database.selectFrom("asset").selectAll().execute()
      return Promise.resolve(data)
    },

    async listWithCustomFields(): Promise<AssetWithCustomFields[]> {
      const assets = await database.selectFrom("asset").selectAll().execute()
      const assetIds = assets.map((asset) => asset.id)

      if (assetIds.length === 0) {
        return []
      }

      const definitionsByAssetId =
        await listAssignedCustomFieldDefinitionsByAssetId(database, assetIds)
      const overrides = await database
        .selectFrom("asset_custom_field_value")
        .select(["assetId", "fieldId", "value"])
        .where("assetId", "in", assetIds)
        .execute()
      const overridesByAssetAndFieldId = new Map(
        overrides.map((override) => [
          `${override.assetId}:${override.fieldId}`,
          override.value
        ])
      )

      return assets.map((asset) => ({
        ...asset,
        customFields: (definitionsByAssetId.get(asset.id) ?? []).map(
          (definition) =>
            toCustomFieldValue(
              definition,
              overridesByAssetAndFieldId.get(`${asset.id}:${definition.id}`)
            )
        )
      }))
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

    async create(asset: Asset): Promise<Asset> {
      const createdAsset = await database
        .insertInto("asset")
        .values({
          name: asset.name,
          type: asset.type
        })
        .returningAll()
        .executeTakeFirst()

      return createdAsset!
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

    async listCustomFieldDefinitions(): Promise<AssetCustomFieldDefinition[]> {
      return await listCustomFieldDefinitions(database)
    },

    async getCustomFieldDefinitionByID(
      id: string
    ): Promise<AssetCustomFieldDefinition | null> {
      return await getCustomFieldDefinitionByID(database, id)
    },

    async createCustomFieldDefinition(
      definition: CreateAssetCustomFieldDefinition
    ): Promise<AssetCustomFieldDefinition> {
      return await database.transaction().execute(async (trx) => {
        const createdField = await trx
          .insertInto("asset_custom_field")
          .values({
            key: definition.key,
            name: definition.name,
            type: definition.type,
            required: definition.required,
            defaultValue: toNullableJsonbValue(definition.defaultValue)
          })
          .returningAll()
          .executeTakeFirst()

        await insertCustomFieldOptions(trx, createdField!.id, definition)

        return (await getCustomFieldDefinitionByID(trx, createdField!.id))!
      })
    },

    async updateCustomFieldDefinitionByID(
      id: string,
      definition: CreateAssetCustomFieldDefinition
    ): Promise<AssetCustomFieldDefinition | null> {
      return await database.transaction().execute(async (trx) => {
        const updatedField = await trx
          .updateTable("asset_custom_field")
          .set({
            key: definition.key,
            name: definition.name,
            type: definition.type,
            required: definition.required,
            defaultValue: toNullableJsonbValue(definition.defaultValue)
          })
          .where("id", "=", id)
          .returningAll()
          .executeTakeFirst()

        if (!updatedField) {
          return null
        }

        await trx
          .deleteFrom("asset_custom_field_option")
          .where("fieldId", "=", id)
          .execute()
        await insertCustomFieldOptions(trx, id, definition)

        return await getCustomFieldDefinitionByID(trx, id)
      })
    },

    async deleteCustomFieldDefinitionByID(
      id: string
    ): Promise<AssetCustomFieldDefinition | null> {
      return await database.transaction().execute(async (trx) => {
        const existingField = await getCustomFieldDefinitionByID(trx, id)

        if (!existingField) {
          return null
        }

        await trx
          .deleteFrom("asset_custom_field")
          .where("id", "=", id)
          .execute()

        return existingField
      })
    },

    async listCustomFieldValues(
      assetId: string
    ): Promise<AssetCustomFieldValue[]> {
      const definitions = await listAssignedCustomFieldDefinitions(
        database,
        assetId
      )
      const overrides = await database
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
    },

    async upsertCustomFieldValues(
      assetId: string,
      values: UpdateAssetCustomFieldValue[]
    ): Promise<AssetCustomFieldValue[]> {
      return await database.transaction().execute(async (trx) => {
        for (const value of values) {
          if (value.value === null) {
            await trx
              .deleteFrom("asset_custom_field_value")
              .where("assetId", "=", assetId)
              .where("fieldId", "=", value.fieldId)
              .execute()
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
    },

    async clearCustomFieldValue(
      assetId: string,
      fieldId: string
    ): Promise<void> {
      await database
        .deleteFrom("asset_custom_field_value")
        .where("assetId", "=", assetId)
        .where("fieldId", "=", fieldId)
        .execute()
    },

    async listAvailableCustomFieldDefinitions(
      assetId: string
    ): Promise<AssetCustomFieldDefinition[]> {
      const fields = await database
        .selectFrom("asset_custom_field")
        .selectAll("asset_custom_field")
        .where((eb) =>
          eb.not(
            eb.exists(
              eb
                .selectFrom("asset_custom_field_assignment")
                .select("asset_custom_field_assignment.fieldId")
                .whereRef(
                  "asset_custom_field_assignment.fieldId",
                  "=",
                  "asset_custom_field.id"
                )
                .where("asset_custom_field_assignment.assetId", "=", assetId)
            )
          )
        )
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
    },

    async assignCustomFields(
      assetId: string,
      fieldIds: string[]
    ): Promise<AssetCustomFieldValue[]> {
      return await database.transaction().execute(async (trx) => {
        if (fieldIds.length > 0) {
          await trx
            .insertInto("asset_custom_field_assignment")
            .values(fieldIds.map((fieldId) => ({ assetId, fieldId })))
            .onConflict((oc) => oc.columns(["assetId", "fieldId"]).doNothing())
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
    },

    async detachCustomField(assetId: string, fieldId: string): Promise<void> {
      await database.transaction().execute(async (trx) => {
        await trx
          .deleteFrom("asset_custom_field_value")
          .where("assetId", "=", assetId)
          .where("fieldId", "=", fieldId)
          .execute()

        await trx
          .deleteFrom("asset_custom_field_assignment")
          .where("assetId", "=", assetId)
          .where("fieldId", "=", fieldId)
          .execute()
      })
    }
  }
}
