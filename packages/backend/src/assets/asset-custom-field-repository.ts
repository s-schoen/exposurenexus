import {
  type AssetCustomFieldDefinition,
  type AssetCustomFieldOption,
  type AssetCustomFieldValue,
  AssetCustomFieldValueSource,
  type CreateAssetCustomFieldDefinition,
  AssetCustomFieldType,
  type UpdateAssetCustomFieldDefinition,
  type UpdateAssetCustomFieldValue,
} from "@exposurenexus/contracts/model/asset-custom-field";
import { sql, type Kysely, type RawBuilder, type Selectable, type Transaction } from "kysely";

import { type Database } from "../database/index.js";
import { updateAssetAudit, type AssetAuditRecord } from "./asset-audit.js";
import { getAssetByID } from "./asset-records.js";

import type { AssetCustomFieldStoredValue } from "../database/index.js";
import type { AssetWithCustomFields } from "@exposurenexus/contracts/model/asset";

type DatabaseExecutor = Kysely<Database> | Transaction<Database>;
type AssetCustomFieldRow = Selectable<Database["asset_custom_field"]>;
type AssetCustomFieldAssignmentDefinitionRow = AssetCustomFieldRow & {
  assetId: string;
};
export interface AssetCustomFieldUpdatePersistenceResult {
  previous: AssetCustomFieldDefinition;
  current: AssetCustomFieldDefinition;
}

export interface AssetCustomFieldAssetMutationPersistenceResult {
  values: AssetCustomFieldValue[];
  previous: AssetWithCustomFields;
  current: AssetWithCustomFields;
}

export interface AssetCustomFieldRepository {
  listDefinitions(): Promise<AssetCustomFieldDefinition[]>;
  getDefinitionByID(id: string): Promise<AssetCustomFieldDefinition | null>;
  createDefinition(
    definition: CreateAssetCustomFieldDefinition,
  ): Promise<AssetCustomFieldDefinition>;
  updateDefinitionByID(
    id: string,
    definition: UpdateAssetCustomFieldDefinition,
  ): Promise<AssetCustomFieldUpdatePersistenceResult | null>;
  deleteDefinitionByID(id: string): Promise<AssetCustomFieldDefinition | null>;
  listEffectiveValuesForAsset(assetId: string): Promise<AssetCustomFieldValue[]>;
  listEffectiveValuesForAssets(
    assetIds: readonly string[],
  ): Promise<Map<string, AssetCustomFieldValue[]>>;
  listAvailableDefinitionsForAsset(assetId: string): Promise<AssetCustomFieldDefinition[]>;
  replaceAssignmentsForAsset(
    assetId: string,
    fieldIds: readonly string[],
    audit: AssetAuditRecord,
  ): Promise<AssetCustomFieldAssetMutationPersistenceResult>;
  replaceValuesForAsset(
    assetId: string,
    values: readonly UpdateAssetCustomFieldValue[],
    audit: AssetAuditRecord,
  ): Promise<AssetCustomFieldAssetMutationPersistenceResult>;
}

function toJsonbValue(value: AssetCustomFieldStoredValue): RawBuilder<AssetCustomFieldStoredValue> {
  return sql`${JSON.stringify(value)}::jsonb`;
}

function toNullableJsonbValue(
  value: string | number | null | undefined,
): RawBuilder<AssetCustomFieldStoredValue> | null {
  if (value === null || value === undefined) {
    return null;
  }

  return sql`${JSON.stringify(value)}::jsonb`;
}

function toOptionsByFieldId(
  options: AssetCustomFieldOption[],
): Map<string, AssetCustomFieldOption[]> {
  const optionsByFieldId = new Map<string, AssetCustomFieldOption[]>();

  for (const option of options) {
    const fieldOptions = optionsByFieldId.get(option.fieldId) ?? [];
    fieldOptions.push(option);
    optionsByFieldId.set(option.fieldId, fieldOptions);
  }

  return optionsByFieldId;
}

function toCustomFieldDefinition(
  field: AssetCustomFieldRow,
  options: AssetCustomFieldOption[] = [],
): AssetCustomFieldDefinition {
  switch (field.type) {
    case AssetCustomFieldType.Text:
      return {
        id: field.id,
        key: field.key,
        name: field.name,
        required: field.required,
        type: field.type,
        defaultValue: field.defaultValue as string | null,
      };
    case AssetCustomFieldType.Number:
      return {
        id: field.id,
        key: field.key,
        name: field.name,
        required: field.required,
        type: field.type,
        defaultValue: field.defaultValue as number | null,
      };
    case AssetCustomFieldType.Select:
      return {
        id: field.id,
        key: field.key,
        name: field.name,
        required: field.required,
        type: field.type,
        defaultValue: field.defaultValue as string | null,
        options,
      };
  }
}

function toCustomFieldValue(
  definition: AssetCustomFieldDefinition,
  override: AssetCustomFieldStoredValue | null | undefined,
): AssetCustomFieldValue {
  const hasOverride = override !== undefined;
  const value = hasOverride ? override : definition.defaultValue;
  const source = hasOverride
    ? AssetCustomFieldValueSource.Asset
    : definition.defaultValue !== null
      ? AssetCustomFieldValueSource.Default
      : AssetCustomFieldValueSource.Empty;

  switch (definition.type) {
    case AssetCustomFieldType.Text:
      return {
        fieldId: definition.id,
        key: definition.key,
        name: definition.name,
        source,
        type: definition.type,
        value: value as string | null,
      };
    case AssetCustomFieldType.Number:
      return {
        fieldId: definition.id,
        key: definition.key,
        name: definition.name,
        source,
        type: definition.type,
        value: value as number | null,
      };
    case AssetCustomFieldType.Select:
      return {
        fieldId: definition.id,
        key: definition.key,
        name: definition.name,
        source,
        type: definition.type,
        value: value as string | null,
        options: definition.options,
      };
  }
}

async function listCustomFieldOptions(
  database: DatabaseExecutor,
  fieldIds: readonly string[],
): Promise<AssetCustomFieldOption[]> {
  if (fieldIds.length === 0) {
    return [];
  }

  return await database
    .selectFrom("asset_custom_field_option")
    .selectAll()
    .where("fieldId", "in", [...fieldIds])
    .orderBy("value", "asc")
    .execute();
}

async function listDefinitions(database: DatabaseExecutor): Promise<AssetCustomFieldDefinition[]> {
  const fields = await database
    .selectFrom("asset_custom_field")
    .selectAll()
    .orderBy("key", "asc")
    .execute();
  const optionsByFieldId = toOptionsByFieldId(
    await listCustomFieldOptions(
      database,
      fields.map((field) => field.id),
    ),
  );

  return fields.map((field) =>
    toCustomFieldDefinition(field, optionsByFieldId.get(field.id) ?? []),
  );
}

async function listAssignedDefinitions(
  database: DatabaseExecutor,
  assetId: string,
): Promise<AssetCustomFieldDefinition[]> {
  const fields = await database
    .selectFrom("asset_custom_field_assignment")
    .innerJoin(
      "asset_custom_field",
      "asset_custom_field.id",
      "asset_custom_field_assignment.fieldId",
    )
    .selectAll("asset_custom_field")
    .where("asset_custom_field_assignment.assetId", "=", assetId)
    .orderBy("asset_custom_field.key", "asc")
    .execute();
  const optionsByFieldId = toOptionsByFieldId(
    await listCustomFieldOptions(
      database,
      fields.map((field) => field.id),
    ),
  );

  return fields.map((field) =>
    toCustomFieldDefinition(field, optionsByFieldId.get(field.id) ?? []),
  );
}

async function listAssignedDefinitionsByAssetId(
  database: DatabaseExecutor,
  assetIds: readonly string[],
): Promise<Map<string, AssetCustomFieldDefinition[]>> {
  const definitionsByAssetId = new Map<string, AssetCustomFieldDefinition[]>();

  if (assetIds.length === 0) {
    return definitionsByAssetId;
  }

  const fields = await database
    .selectFrom("asset_custom_field_assignment")
    .innerJoin(
      "asset_custom_field",
      "asset_custom_field.id",
      "asset_custom_field_assignment.fieldId",
    )
    .selectAll("asset_custom_field")
    .select("asset_custom_field_assignment.assetId")
    .where("asset_custom_field_assignment.assetId", "in", [...assetIds])
    .orderBy("asset_custom_field.key", "asc")
    .execute();
  const optionsByFieldId = toOptionsByFieldId(
    await listCustomFieldOptions(
      database,
      fields.map((field) => field.id),
    ),
  );

  for (const field of fields as AssetCustomFieldAssignmentDefinitionRow[]) {
    const definitions = definitionsByAssetId.get(field.assetId) ?? [];
    definitions.push(toCustomFieldDefinition(field, optionsByFieldId.get(field.id) ?? []));
    definitionsByAssetId.set(field.assetId, definitions);
  }

  return definitionsByAssetId;
}

async function getDefinitionByID(
  database: DatabaseExecutor,
  id: string,
): Promise<AssetCustomFieldDefinition | null> {
  const field = await database
    .selectFrom("asset_custom_field")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!field) {
    return null;
  }

  const options = await listCustomFieldOptions(database, [id]);
  return toCustomFieldDefinition(field, options);
}

async function listEffectiveValuesForAsset(
  database: DatabaseExecutor,
  assetId: string,
): Promise<AssetCustomFieldValue[]> {
  const definitions = await listAssignedDefinitions(database, assetId);
  const overrides = await database
    .selectFrom("asset_custom_field_value")
    .select(["fieldId", "value"])
    .where("assetId", "=", assetId)
    .execute();
  const overridesByFieldId = new Map(
    overrides.map((override) => [override.fieldId, override.value]),
  );

  return definitions.map((definition) =>
    toCustomFieldValue(definition, overridesByFieldId.get(definition.id)),
  );
}
export async function getAssetSnapshot(
  database: DatabaseExecutor,
  assetId: string,
): Promise<AssetWithCustomFields | null> {
  const asset = await getAssetByID(database, assetId);
  if (!asset) {
    return null;
  }

  return {
    ...asset,
    customFields: await listEffectiveValuesForAsset(database, assetId),
  };
}

async function listEffectiveValuesForAssets(
  database: DatabaseExecutor,
  assetIds: readonly string[],
): Promise<Map<string, AssetCustomFieldValue[]>> {
  const valuesByAssetId = new Map<string, AssetCustomFieldValue[]>();

  if (assetIds.length === 0) {
    return valuesByAssetId;
  }

  const definitionsByAssetId = await listAssignedDefinitionsByAssetId(database, assetIds);
  const overrides = await database
    .selectFrom("asset_custom_field_value")
    .select(["assetId", "fieldId", "value"])
    .where("assetId", "in", [...assetIds])
    .execute();
  const overridesByAssetAndFieldId = new Map(
    overrides.map((override) => [`${override.assetId}:${override.fieldId}`, override.value]),
  );

  for (const assetId of assetIds) {
    const definitions = definitionsByAssetId.get(assetId) ?? [];
    valuesByAssetId.set(
      assetId,
      definitions.map((definition) =>
        toCustomFieldValue(
          definition,
          overridesByAssetAndFieldId.get(`${assetId}:${definition.id}`),
        ),
      ),
    );
  }

  return valuesByAssetId;
}

async function listAvailableDefinitionsForAsset(
  database: DatabaseExecutor,
  assetId: string,
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
            .whereRef("asset_custom_field_assignment.fieldId", "=", "asset_custom_field.id")
            .where("asset_custom_field_assignment.assetId", "=", assetId),
        ),
      ),
    )
    .orderBy("asset_custom_field.key", "asc")
    .execute();
  const optionsByFieldId = toOptionsByFieldId(
    await listCustomFieldOptions(
      database,
      fields.map((field) => field.id),
    ),
  );

  return fields.map((field) =>
    toCustomFieldDefinition(field, optionsByFieldId.get(field.id) ?? []),
  );
}

async function replaceAssignmentsForAsset(
  database: Kysely<Database>,
  assetId: string,
  fieldIds: readonly string[],
  audit: AssetAuditRecord,
): Promise<AssetCustomFieldAssetMutationPersistenceResult> {
  return await database
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (trx) => {
      const previous = await getAssetSnapshot(trx, assetId);
      if (!previous) {
        throw new Error(`asset ${assetId} does not exist`);
      }

      const valueDelete = trx.deleteFrom("asset_custom_field_value").where("assetId", "=", assetId);

      if (fieldIds.length === 0) {
        await valueDelete.execute();
      } else {
        await valueDelete.where("fieldId", "not in", [...fieldIds]).execute();
      }

      await trx
        .deleteFrom("asset_custom_field_assignment")
        .where("assetId", "=", assetId)
        .execute();

      if (fieldIds.length > 0) {
        await trx
          .insertInto("asset_custom_field_assignment")
          .values(fieldIds.map((fieldId) => ({ assetId, fieldId })))
          .execute();
      }

      const currentValues = await listEffectiveValuesForAsset(trx, assetId);
      if (JSON.stringify(previous.customFields) !== JSON.stringify(currentValues)) {
        await updateAssetAudit(trx, assetId, audit);
      }

      const currentAsset = await getAssetByID(trx, assetId);
      if (!currentAsset) {
        throw new Error(`updated asset ${assetId} could not be loaded`);
      }

      return {
        values: currentValues,
        previous,
        current: { ...currentAsset, customFields: currentValues },
      };
    });
}

async function replaceValuesForAsset(
  database: Kysely<Database>,
  assetId: string,
  values: readonly UpdateAssetCustomFieldValue[],
  audit: AssetAuditRecord,
): Promise<AssetCustomFieldAssetMutationPersistenceResult> {
  return await database
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (trx) => {
      const previous = await getAssetSnapshot(trx, assetId);
      if (!previous) {
        throw new Error(`asset ${assetId} does not exist`);
      }

      await trx.deleteFrom("asset_custom_field_value").where("assetId", "=", assetId).execute();

      for (const value of values) {
        if (value.value === null) {
          continue;
        }

        await trx
          .insertInto("asset_custom_field_value")
          .values({
            assetId,
            fieldId: value.fieldId,
            value: toJsonbValue(value.value),
          })
          .onConflict((oc) =>
            oc.columns(["assetId", "fieldId"]).doUpdateSet({
              value: toJsonbValue(value.value!),
            }),
          )
          .execute();
      }

      const currentValues = await listEffectiveValuesForAsset(trx, assetId);
      if (JSON.stringify(previous.customFields) !== JSON.stringify(currentValues)) {
        await updateAssetAudit(trx, assetId, audit);
      }

      const currentAsset = await getAssetByID(trx, assetId);
      if (!currentAsset) {
        throw new Error(`updated asset ${assetId} could not be loaded`);
      }

      return {
        values: currentValues,
        previous,
        current: { ...currentAsset, customFields: currentValues },
      };
    });
}

async function insertCustomFieldOptions(
  database: DatabaseExecutor,
  fieldId: string,
  definition: CreateAssetCustomFieldDefinition | UpdateAssetCustomFieldDefinition,
): Promise<void> {
  if (definition.type !== AssetCustomFieldType.Select) {
    return;
  }

  await database
    .insertInto("asset_custom_field_option")
    .values(
      definition.options.map((option) => ({
        fieldId,
        value: option.value,
        label: option.label,
      })),
    )
    .execute();
}

export function createAssetCustomFieldRepository(
  database: Kysely<Database>,
): AssetCustomFieldRepository {
  return {
    async listDefinitions(): Promise<AssetCustomFieldDefinition[]> {
      return await listDefinitions(database);
    },

    async getDefinitionByID(id: string): Promise<AssetCustomFieldDefinition | null> {
      return await getDefinitionByID(database, id);
    },

    async createDefinition(
      definition: CreateAssetCustomFieldDefinition,
    ): Promise<AssetCustomFieldDefinition> {
      return await database
        .transaction()
        .setIsolationLevel("repeatable read")
        .execute(async (trx) => {
          const createdField = await trx
            .insertInto("asset_custom_field")
            .values({
              key: definition.key,
              name: definition.name,
              type: definition.type,
              required: definition.required,
              defaultValue: toNullableJsonbValue(definition.defaultValue),
            })
            .returningAll()
            .executeTakeFirst();

          await insertCustomFieldOptions(trx, createdField!.id, definition);

          return (await getDefinitionByID(trx, createdField!.id))!;
        });
    },

    async updateDefinitionByID(
      id: string,
      definition: UpdateAssetCustomFieldDefinition,
    ): Promise<AssetCustomFieldUpdatePersistenceResult | null> {
      return await database
        .transaction()
        .setIsolationLevel("repeatable read")
        .execute(async (trx) => {
          const previous = await getDefinitionByID(trx, id);
          if (!previous) {
            return null;
          }

          const updatedField = await trx
            .updateTable("asset_custom_field")
            .set({
              key: definition.key,
              name: definition.name,
              type: definition.type,
              required: definition.required,
              defaultValue: toNullableJsonbValue(definition.defaultValue),
            })
            .where("id", "=", id)
            .returning("id")
            .executeTakeFirst();

          if (!updatedField) {
            return null;
          }

          await trx.deleteFrom("asset_custom_field_option").where("fieldId", "=", id).execute();
          await insertCustomFieldOptions(trx, id, definition);

          const current = await getDefinitionByID(trx, id);
          if (!current) {
            throw new Error(`updated asset custom field ${id} could not be loaded`);
          }
          return { previous, current };
        });
    },

    async deleteDefinitionByID(id: string): Promise<AssetCustomFieldDefinition | null> {
      return await database
        .transaction()
        .setIsolationLevel("repeatable read")
        .execute(async (trx) => {
          const existingField = await getDefinitionByID(trx, id);

          if (!existingField) {
            return null;
          }

          await trx.deleteFrom("asset_custom_field").where("id", "=", id).execute();

          return existingField;
        });
    },

    async listEffectiveValuesForAsset(assetId: string): Promise<AssetCustomFieldValue[]> {
      return await listEffectiveValuesForAsset(database, assetId);
    },

    async listEffectiveValuesForAssets(
      assetIds: readonly string[],
    ): Promise<Map<string, AssetCustomFieldValue[]>> {
      return await listEffectiveValuesForAssets(database, assetIds);
    },

    async listAvailableDefinitionsForAsset(assetId: string): Promise<AssetCustomFieldDefinition[]> {
      return await listAvailableDefinitionsForAsset(database, assetId);
    },

    async replaceAssignmentsForAsset(
      assetId: string,
      fieldIds: readonly string[],
      audit: AssetAuditRecord,
    ): Promise<AssetCustomFieldAssetMutationPersistenceResult> {
      return await replaceAssignmentsForAsset(database, assetId, fieldIds, audit);
    },

    async replaceValuesForAsset(
      assetId: string,
      values: readonly UpdateAssetCustomFieldValue[],
      audit: AssetAuditRecord,
    ): Promise<AssetCustomFieldAssetMutationPersistenceResult> {
      return await replaceValuesForAsset(database, assetId, values, audit);
    },
  };
}
