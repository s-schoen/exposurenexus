import {
  type AssetCustomFieldDefinition,
  type AssetCustomFieldOption,
  type AssetCustomFieldValue,
  AssetCustomFieldValueSource,
  AssetCustomFieldType,
} from "@exposurenexus/contracts/model/asset-custom-field";

import { getAssetByID } from "./asset-records.js";

import type { DatabaseExecutor } from "../database/executor.js";
import type { AssetCustomFieldStoredValue, Database } from "../database/index.js";
import type { AssetWithCustomFields } from "@exposurenexus/contracts/model/asset";
import type { Selectable } from "kysely";

type AssetCustomFieldRow = Selectable<Database["asset_custom_field"]>;
type AssetCustomFieldAssignmentDefinitionRow = AssetCustomFieldRow & {
  assetId: string;
};

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

export async function listCustomFieldDefinitions(
  database: DatabaseExecutor,
): Promise<AssetCustomFieldDefinition[]> {
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

export async function getCustomFieldDefinitionByID(
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

export async function listEffectiveValuesForAsset(
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

export async function listEffectiveValuesForAssets(
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

export async function listAvailableDefinitionsForAsset(
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
