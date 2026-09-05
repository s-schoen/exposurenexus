import {
  type AssetCustomFieldDefinition,
  type AssetCustomFieldValue,
  type CreateAssetCustomFieldDefinition,
  AssetCustomFieldType,
  type UpdateAssetCustomFieldDefinition,
  type UpdateAssetCustomFieldValue,
} from "@exposurenexus/contracts/model/asset-custom-field";
import { sql } from "kysely";

import { updateAssetAudit, type AssetAuditRecord } from "./asset-audit.js";
import {
  getCustomFieldDefinitionByID,
  listCustomFieldDefinitions,
  listEffectiveValuesForAsset,
} from "./asset-projection.js";
import { getAssetByID } from "./asset-records.js";

import type { DatabaseExecutor } from "../database/executor.js";
import type { AssetCustomFieldStoredValue } from "../database/index.js";
import type { AssetWithCustomFields } from "@exposurenexus/contracts/model/asset";
import type { RawBuilder } from "kysely";

export interface AssetCustomFieldUpdatePersistenceResult {
  previous: AssetCustomFieldDefinition;
  current: AssetCustomFieldDefinition;
}

export interface AssetCustomFieldAssetMutationPersistenceResult {
  values: AssetCustomFieldValue[];
  previous: AssetWithCustomFields;
  current: AssetWithCustomFields;
}

function toJsonbValue(value: AssetCustomFieldStoredValue): RawBuilder<AssetCustomFieldStoredValue> {
  return sql<AssetCustomFieldStoredValue>`${JSON.stringify(value)}::jsonb`;
}

function toNullableJsonbValue(
  value: string | number | null | undefined,
): RawBuilder<AssetCustomFieldStoredValue> | null {
  if (value === null || value === undefined) {
    return null;
  }

  return sql<AssetCustomFieldStoredValue>`${JSON.stringify(value)}::jsonb`;
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

export async function listDefinitions(
  database: DatabaseExecutor,
): Promise<AssetCustomFieldDefinition[]> {
  return await listCustomFieldDefinitions(database);
}

export async function getDefinitionByID(
  database: DatabaseExecutor,
  id: string,
): Promise<AssetCustomFieldDefinition | null> {
  return await getCustomFieldDefinitionByID(database, id);
}

export async function insertDefinition(
  database: DatabaseExecutor,
  definition: CreateAssetCustomFieldDefinition,
): Promise<AssetCustomFieldDefinition> {
  const createdField = await database
    .insertInto("asset_custom_field")
    .values({
      key: definition.key,
      name: definition.name,
      type: definition.type,
      required: definition.required,
      defaultValue: toNullableJsonbValue(definition.defaultValue),
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  await insertCustomFieldOptions(database, createdField.id, definition);

  return (await getDefinitionByID(database, createdField.id))!;
}

export async function updateDefinition(
  database: DatabaseExecutor,
  {
    id,
    definition,
    previous,
  }: {
    id: string;
    definition: UpdateAssetCustomFieldDefinition;
    previous: AssetCustomFieldDefinition;
  },
): Promise<AssetCustomFieldUpdatePersistenceResult | null> {
  const updatedField = await database
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

  await database.deleteFrom("asset_custom_field_option").where("fieldId", "=", id).execute();
  await insertCustomFieldOptions(database, id, definition);

  const current = await getDefinitionByID(database, id);
  if (!current) {
    throw new Error(`updated asset custom field ${id} could not be loaded`);
  }

  return { previous, current };
}

export async function deleteDefinition(
  database: DatabaseExecutor,
  id: string,
): Promise<AssetCustomFieldDefinition | null> {
  const existingField = await getDefinitionByID(database, id);
  if (!existingField) {
    return null;
  }

  await database.deleteFrom("asset_custom_field").where("id", "=", id).execute();
  return existingField;
}

export async function replaceAssignments(
  database: DatabaseExecutor,
  {
    assetId,
    fieldIds,
    audit,
    previous,
  }: {
    assetId: string;
    fieldIds: readonly string[];
    audit: AssetAuditRecord;
    previous: AssetWithCustomFields;
  },
): Promise<AssetCustomFieldAssetMutationPersistenceResult> {
  const valueDelete = database
    .deleteFrom("asset_custom_field_value")
    .where("assetId", "=", assetId);

  if (fieldIds.length === 0) {
    await valueDelete.execute();
  } else {
    await valueDelete.where("fieldId", "not in", [...fieldIds]).execute();
  }

  await database
    .deleteFrom("asset_custom_field_assignment")
    .where("assetId", "=", assetId)
    .execute();

  if (fieldIds.length > 0) {
    await database
      .insertInto("asset_custom_field_assignment")
      .values(fieldIds.map((fieldId) => ({ assetId, fieldId })))
      .execute();
  }

  const currentValues = await listEffectiveValuesForAsset(database, assetId);
  if (JSON.stringify(previous.customFields) !== JSON.stringify(currentValues)) {
    await updateAssetAudit(database, assetId, audit);
  }

  const currentAsset = await getAssetByID(database, assetId);
  if (!currentAsset) {
    throw new Error(`updated asset ${assetId} could not be loaded`);
  }

  return {
    values: currentValues,
    previous,
    current: { ...currentAsset, customFields: currentValues },
  };
}

export async function replaceValues(
  database: DatabaseExecutor,
  {
    assetId,
    values,
    audit,
    previous,
  }: {
    assetId: string;
    values: readonly UpdateAssetCustomFieldValue[];
    audit: AssetAuditRecord;
    previous: AssetWithCustomFields;
  },
): Promise<AssetCustomFieldAssetMutationPersistenceResult> {
  await database.deleteFrom("asset_custom_field_value").where("assetId", "=", assetId).execute();

  for (const value of values) {
    if (value.value === null) {
      continue;
    }

    await database
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

  const currentValues = await listEffectiveValuesForAsset(database, assetId);
  if (JSON.stringify(previous.customFields) !== JSON.stringify(currentValues)) {
    await updateAssetAudit(database, assetId, audit);
  }

  const currentAsset = await getAssetByID(database, assetId);
  if (!currentAsset) {
    throw new Error(`updated asset ${assetId} could not be loaded`);
  }

  return {
    values: currentValues,
    previous,
    current: { ...currentAsset, customFields: currentValues },
  };
}
