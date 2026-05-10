import {
  type AssetCustomFieldDefinition,
  type AssetCustomFieldOption,
  type CreateAssetCustomFieldDefinition,
  AssetCustomFieldType,
  type UpdateAssetCustomFieldDefinition
} from "@exposurenexus/types/model/asset-custom-field"
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

export interface AssetCustomFieldRepository {
  listDefinitions(): Promise<AssetCustomFieldDefinition[]>
  getDefinitionByID(id: string): Promise<AssetCustomFieldDefinition | null>
  createDefinition(
    definition: CreateAssetCustomFieldDefinition
  ): Promise<AssetCustomFieldDefinition>
  updateDefinitionByID(
    id: string,
    definition: UpdateAssetCustomFieldDefinition
  ): Promise<AssetCustomFieldDefinition | null>
  deleteDefinitionByID(id: string): Promise<AssetCustomFieldDefinition | null>
}

function toNullableJsonbValue(
  value: string | number | null | undefined
): RawBuilder<AssetCustomFieldStoredValue> | null {
  if (value === null || value === undefined) {
    return null
  }

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

async function listDefinitions(
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

async function getDefinitionByID(
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
  definition:
    | CreateAssetCustomFieldDefinition
    | UpdateAssetCustomFieldDefinition
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

export function createAssetCustomFieldRepository(
  database: Kysely<Database>
): AssetCustomFieldRepository {
  return {
    async listDefinitions(): Promise<AssetCustomFieldDefinition[]> {
      return await listDefinitions(database)
    },

    async getDefinitionByID(
      id: string
    ): Promise<AssetCustomFieldDefinition | null> {
      return await getDefinitionByID(database, id)
    },

    async createDefinition(
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

        return (await getDefinitionByID(trx, createdField!.id))!
      })
    },

    async updateDefinitionByID(
      id: string,
      definition: UpdateAssetCustomFieldDefinition
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

        return await getDefinitionByID(trx, id)
      })
    },

    async deleteDefinitionByID(
      id: string
    ): Promise<AssetCustomFieldDefinition | null> {
      return await database.transaction().execute(async (trx) => {
        const existingField = await getDefinitionByID(trx, id)

        if (!existingField) {
          return null
        }

        await trx
          .deleteFrom("asset_custom_field")
          .where("id", "=", id)
          .execute()

        return existingField
      })
    }
  }
}
