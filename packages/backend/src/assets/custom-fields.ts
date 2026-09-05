import {
  type AssetCustomFieldDefinition,
  type AssetCustomFieldRuleViolation,
  type AssetCustomFieldValue,
  type AssetCustomFieldValueLiteral,
  AssetCustomFieldRuleViolationReason,
  AssetCustomFieldType,
  type CreateAssetCustomFieldDefinition,
  type UpdateAssetCustomFieldDefinition,
  type UpdateAssetCustomFieldValue,
  validateAssetCustomFieldDefinitionRules,
} from "@exposurenexus/contracts/model/asset-custom-field";

import { ApplicationError, isApplicationError } from "../application-error.js";
import { isConflictError } from "../database-error.js";

import type { DatabaseExecutor } from "../database/executor.js";
import type { Database } from "../database/index.js";
import type {
  AssetCustomFieldAssetMutationPersistenceResult,
  AssetCustomFieldUpdatePersistenceResult,
} from "./asset-custom-field-persistence.js";
import type {
  AssetCustomFieldAssignmentsReplacedOutcome,
  AssetCustomFieldDefinitionCreatedOutcome,
  AssetCustomFieldDefinitionDeletedOutcome,
  AssetCustomFieldDefinitionUpdatedOutcome,
  AssetCustomFields,
  AssetCustomFieldValuesReplacedOutcome,
  CreateAssetCustomFieldDefinitionCommand,
  DeleteAssetCustomFieldDefinitionByIDCommand,
  ReplaceAssetCustomFieldAssignmentsCommand,
  ReplaceAssetCustomFieldValuesCommand,
  UpdateAssetCustomFieldDefinitionByIDCommand,
} from "./assets.js";
import type { AssetWithCustomFields } from "@exposurenexus/contracts/model/asset";
import type { Kysely } from "kysely";
import type { Logger } from "pino";

interface AssetProjection {
  getAssetSnapshot(
    database: DatabaseExecutor,
    assetId: string,
  ): Promise<AssetWithCustomFields | null>;
  listEffectiveValuesForAsset(
    database: DatabaseExecutor,
    assetId: string,
  ): Promise<AssetCustomFieldValue[]>;
  listEffectiveValuesForAssets(
    database: DatabaseExecutor,
    assetIds: readonly string[],
  ): Promise<Map<string, AssetCustomFieldValue[]>>;
  listAvailableDefinitionsForAsset(
    database: DatabaseExecutor,
    assetId: string,
  ): Promise<AssetCustomFieldDefinition[]>;
}

interface AssetCustomFieldPersistence {
  listDefinitions(database: DatabaseExecutor): Promise<AssetCustomFieldDefinition[]>;
  getDefinitionByID(
    database: DatabaseExecutor,
    id: string,
  ): Promise<AssetCustomFieldDefinition | null>;
  insertDefinition(
    database: DatabaseExecutor,
    definition: CreateAssetCustomFieldDefinition,
  ): Promise<AssetCustomFieldDefinition>;
  updateDefinition(
    database: DatabaseExecutor,
    options: {
      id: string;
      definition: UpdateAssetCustomFieldDefinition;
      previous: AssetCustomFieldDefinition;
    },
  ): Promise<AssetCustomFieldUpdatePersistenceResult | null>;
  deleteDefinition(
    database: DatabaseExecutor,
    id: string,
  ): Promise<AssetCustomFieldDefinition | null>;
  replaceAssignments(
    database: DatabaseExecutor,
    options: {
      assetId: string;
      fieldIds: readonly string[];
      audit: { updatedAt: Date; updatedBy: string };
      previous: AssetWithCustomFields;
    },
  ): Promise<AssetCustomFieldAssetMutationPersistenceResult>;
  replaceValues(
    database: DatabaseExecutor,
    options: {
      assetId: string;
      values: readonly UpdateAssetCustomFieldValue[];
      audit: { updatedAt: Date; updatedBy: string };
      previous: AssetWithCustomFields;
    },
  ): Promise<AssetCustomFieldAssetMutationPersistenceResult>;
}

function customFieldRuleViolationMessage(violation: AssetCustomFieldRuleViolation): string {
  switch (violation.reason) {
    case AssetCustomFieldRuleViolationReason.ReservedKey:
      return "asset custom field key is reserved for core asset metadata";
    case AssetCustomFieldRuleViolationReason.RequiredDefaultMissing:
      return "required asset custom fields must define a default value";
    case AssetCustomFieldRuleViolationReason.TextDefaultMustBeString:
      return "text asset custom field default must be a string";
    case AssetCustomFieldRuleViolationReason.NumberDefaultMustBeNumber:
      return "number asset custom field default must be a number";
    case AssetCustomFieldRuleViolationReason.SelectDefaultMustBeString:
      return "select asset custom field default must be a string";
    case AssetCustomFieldRuleViolationReason.SelectDefaultMustMatchOption:
      return "select asset custom field default must match an option value";
    case AssetCustomFieldRuleViolationReason.SelectOptionValuesMustBeUnique:
      return "select asset custom field options must be unique";
  }
}

function validateCustomFieldDefinition(
  definition: CreateAssetCustomFieldDefinition | UpdateAssetCustomFieldDefinition,
): void {
  const [violation] = validateAssetCustomFieldDefinitionRules(definition);

  if (violation) {
    throw new ApplicationError({
      code: "asset_custom_field.definition.rule_violation",
      kind: "validation",
      message: customFieldRuleViolationMessage(violation),
      cause: violation,
      details: violation,
    });
  }
}

function customFieldDefinitionsEqual(
  previous: AssetCustomFieldDefinition,
  current: AssetCustomFieldDefinition,
): boolean {
  return JSON.stringify(previous) === JSON.stringify(current);
}

function isValidValueForDefinition(
  definition: AssetCustomFieldValue,
  value: Exclude<AssetCustomFieldValueLiteral, null>,
): boolean {
  switch (definition.type) {
    case AssetCustomFieldType.Text:
      return typeof value === "string";
    case AssetCustomFieldType.Number:
      return typeof value === "number";
    case AssetCustomFieldType.Select:
      return (
        typeof value === "string" && definition.options.some((option) => option.value === value)
      );
  }
}

function assetSnapshotsEqual(
  previous: AssetWithCustomFields,
  current: AssetWithCustomFields,
): boolean {
  return JSON.stringify(previous) === JSON.stringify(current);
}

function findDuplicate(values: readonly string[]): string | null {
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      return value;
    }
    seen.add(value);
  }

  return null;
}

interface UserProfileLookup {
  getByID(database: DatabaseExecutor, id: string): Promise<object | null>;
}

interface AssetCustomFieldsDependencies {
  database: Kysely<Database>;
  assetCustomFieldPersistence: AssetCustomFieldPersistence;
  assetProjection: AssetProjection;
  userProfileLookup: UserProfileLookup;
  logger: Logger;
}

export function createAssetCustomFields({
  database,
  assetCustomFieldPersistence,
  assetProjection,
  userProfileLookup,
  logger,
}: AssetCustomFieldsDependencies): AssetCustomFields {
  async function requireAuditActor(executor: DatabaseExecutor, performedBy: string): Promise<void> {
    if (!(await userProfileLookup.getByID(executor, performedBy))) {
      throw new Error(`asset audit actor ${performedBy} does not exist`);
    }
  }

  return {
    async listDefinitions(): Promise<AssetCustomFieldDefinition[]> {
      try {
        return await assetCustomFieldPersistence.listDefinitions(database);
      } catch (error) {
        logger.error(error, "failed to list asset custom field definitions");
        throw new ApplicationError({
          code: "asset_custom_field.definition.list_failed",
          kind: "unexpected",
          message: "failed to list asset custom field definitions",
          cause: error,
        });
      }
    },

    async getDefinitionByID(id: string): Promise<AssetCustomFieldDefinition | null> {
      try {
        const definition = await assetCustomFieldPersistence.getDefinitionByID(database, id);
        if (!definition) {
          logger.debug(`asset custom field definition with id ${id} not found`);
        }
        return definition;
      } catch (error) {
        logger.error(error, `failed to get asset custom field definition with id ${id}`);
        throw new ApplicationError({
          code: "asset_custom_field.definition.get_failed",
          kind: "unexpected",
          message: "failed to get asset custom field definition",
          cause: error,
          details: { fieldId: id },
        });
      }
    },

    async createDefinition(
      opts: CreateAssetCustomFieldDefinitionCommand,
    ): Promise<AssetCustomFieldDefinitionCreatedOutcome> {
      const { definition, performedBy } = opts;
      validateCustomFieldDefinition(definition);

      try {
        const created = await database
          .transaction()
          .setIsolationLevel("repeatable read")
          .execute((trx) => assetCustomFieldPersistence.insertDefinition(trx, definition));
        return { current: created, performedBy };
      } catch (error) {
        if (isConflictError(error)) {
          logger.debug(error, "asset custom field definition create conflict");
          throw new ApplicationError({
            code: "asset_custom_field.definition.create_conflict",
            kind: "conflict",
            message: "asset custom field definition already exists",
            cause: error,
            details: { fieldKey: definition.key },
          });
        }

        logger.error(error, `failed to create asset custom field definition ${definition.key}`);
        throw new ApplicationError({
          code: "asset_custom_field.definition.create_failed",
          kind: "unexpected",
          message: "failed to create asset custom field definition",
          cause: error,
          details: { fieldKey: definition.key },
        });
      }
    },

    async updateDefinitionByID(
      opts: UpdateAssetCustomFieldDefinitionByIDCommand,
    ): Promise<AssetCustomFieldDefinitionUpdatedOutcome | null> {
      const { id, definition, performedBy } = opts;
      validateCustomFieldDefinition(definition);

      try {
        const updated = await database
          .transaction()
          .setIsolationLevel("repeatable read")
          .execute(async (trx) => {
            const previous = await assetCustomFieldPersistence.getDefinitionByID(trx, id);
            if (!previous) {
              return null;
            }

            return await assetCustomFieldPersistence.updateDefinition(trx, {
              id,
              definition,
              previous,
            });
          });
        if (!updated) {
          logger.debug(`asset custom field definition with id ${id} not found`);
          return null;
        }

        return {
          previous: updated.previous,
          current: updated.current,
          changed: !customFieldDefinitionsEqual(updated.previous, updated.current),
          performedBy,
        };
      } catch (error) {
        if (isConflictError(error)) {
          logger.debug(error, "asset custom field definition update conflict");
          throw new ApplicationError({
            code: "asset_custom_field.definition.update_conflict",
            kind: "conflict",
            message: "asset custom field definition already exists",
            cause: error,
            details: { fieldId: id, fieldKey: definition.key },
          });
        }

        logger.error(error, `failed to update asset custom field definition with id ${id}`);
        throw new ApplicationError({
          code: "asset_custom_field.definition.update_failed",
          kind: "unexpected",
          message: "failed to update asset custom field definition",
          cause: error,
          details: { fieldId: id },
        });
      }
    },

    async deleteDefinitionByID(
      opts: DeleteAssetCustomFieldDefinitionByIDCommand,
    ): Promise<AssetCustomFieldDefinitionDeletedOutcome | null> {
      const { id, performedBy } = opts;

      try {
        const deleted = await database
          .transaction()
          .setIsolationLevel("repeatable read")
          .execute((trx) => assetCustomFieldPersistence.deleteDefinition(trx, id));
        if (!deleted) {
          logger.debug(`asset custom field definition with id ${id} not found`);
          return null;
        }
        return { previous: deleted, performedBy };
      } catch (error) {
        logger.error(error, `failed to delete asset custom field definition with id ${id}`);
        throw new ApplicationError({
          code: "asset_custom_field.definition.delete_failed",
          kind: "unexpected",
          message: "failed to delete asset custom field definition",
          cause: error,
          details: { fieldId: id },
        });
      }
    },

    async listEffectiveValuesForAsset(assetId: string): Promise<AssetCustomFieldValue[] | null> {
      try {
        const asset = await assetProjection.getAssetSnapshot(database, assetId);
        if (!asset) {
          logger.debug(`asset with id ${assetId} not found`);
          return null;
        }

        return asset.customFields;
      } catch (error) {
        logger.error(error, `failed to list asset custom field values for asset ${assetId}`);
        throw new ApplicationError({
          code: "asset_custom_field.value.list_failed",
          kind: "unexpected",
          message: "failed to list asset custom field values",
          cause: error,
          details: { assetId },
        });
      }
    },

    async listEffectiveValuesForAssets(
      assetIds: readonly string[],
    ): Promise<Map<string, AssetCustomFieldValue[]>> {
      try {
        return await assetProjection.listEffectiveValuesForAssets(database, assetIds);
      } catch (error) {
        logger.error(error, "failed to hydrate asset custom field values");
        throw new ApplicationError({
          code: "asset_custom_field.value.list_for_assets_failed",
          kind: "unexpected",
          message: "failed to hydrate asset custom field values",
          cause: error,
          details: { assetIds: [...assetIds] },
        });
      }
    },

    async listAvailableDefinitionsForAsset(
      assetId: string,
    ): Promise<AssetCustomFieldDefinition[] | null> {
      try {
        const asset = await assetProjection.getAssetSnapshot(database, assetId);
        if (!asset) {
          logger.debug(`asset with id ${assetId} not found`);
          return null;
        }

        return await assetProjection.listAvailableDefinitionsForAsset(database, assetId);
      } catch (error) {
        logger.error(error, `failed to list available asset custom fields for asset ${assetId}`);
        throw new ApplicationError({
          code: "asset_custom_field.definition.list_available_failed",
          kind: "unexpected",
          message: "failed to list available asset custom fields",
          cause: error,
          details: { assetId },
        });
      }
    },

    async replaceAssignmentsForAsset(
      opts: ReplaceAssetCustomFieldAssignmentsCommand,
    ): Promise<AssetCustomFieldAssignmentsReplacedOutcome | null> {
      const { assetId, fieldIds, performedBy } = opts;

      try {
        const updated = await database
          .transaction()
          .setIsolationLevel("repeatable read")
          .execute(async (trx) => {
            const previous = await assetProjection.getAssetSnapshot(trx, assetId);
            if (!previous) {
              return null;
            }

            const duplicateFieldId = findDuplicate(fieldIds);
            if (duplicateFieldId) {
              throw new ApplicationError({
                code: "asset_custom_field.assignment.duplicate",
                kind: "validation",
                message: "asset custom field assignments contain duplicate fields",
                details: { assetId, fieldId: duplicateFieldId },
              });
            }

            const definitions = await assetCustomFieldPersistence.listDefinitions(trx);
            const definitionIds = new Set(definitions.map((definition) => definition.id));

            for (const fieldId of fieldIds) {
              if (definitionIds.has(fieldId)) {
                continue;
              }

              throw new ApplicationError({
                code: "asset_custom_field.definition.unknown",
                kind: "validation",
                message: "unknown asset custom field",
                details: { fieldId },
              });
            }

            await requireAuditActor(trx, performedBy);
            return await assetCustomFieldPersistence.replaceAssignments(trx, {
              assetId,
              fieldIds,
              audit: { updatedAt: new Date(), updatedBy: performedBy },
              previous,
            });
          });

        if (!updated) {
          logger.debug(`asset with id ${assetId} not found`);
          return null;
        }

        return {
          values: updated.values,
          previous: updated.previous,
          current: updated.current,
          changed: !assetSnapshotsEqual(updated.previous, updated.current),
          performedBy,
        };
      } catch (error) {
        if (isApplicationError(error)) {
          throw error;
        }

        logger.error(
          error,
          `failed to replace asset custom field assignments for asset ${assetId}`,
        );
        throw new ApplicationError({
          code: "asset_custom_field.assignment.replace_failed",
          kind: "unexpected",
          message: "failed to replace asset custom field assignments",
          cause: error,
          details: { assetId },
        });
      }
    },

    async replaceValuesForAsset(
      opts: ReplaceAssetCustomFieldValuesCommand,
    ): Promise<AssetCustomFieldValuesReplacedOutcome | null> {
      const { assetId, values, performedBy } = opts;

      try {
        const updated = await database
          .transaction()
          .setIsolationLevel("repeatable read")
          .execute(async (trx) => {
            const previous = await assetProjection.getAssetSnapshot(trx, assetId);
            if (!previous) {
              return null;
            }

            const duplicateFieldId = findDuplicate(values.map((value) => value.fieldId));
            if (duplicateFieldId) {
              throw new ApplicationError({
                code: "asset_custom_field.value.duplicate",
                kind: "validation",
                message: "asset custom field values contain duplicate fields",
                details: { assetId, fieldId: duplicateFieldId },
              });
            }

            const fieldsById = new Map(
              previous.customFields.map((field) => [field.fieldId, field]),
            );
            const submittedFieldIds = new Set(values.map((value) => value.fieldId));

            for (const assignedFieldId of fieldsById.keys()) {
              if (submittedFieldIds.has(assignedFieldId)) {
                continue;
              }

              throw new ApplicationError({
                code: "asset_custom_field.value.missing",
                kind: "validation",
                message: "asset custom field value replacement is incomplete",
                details: { assetId, fieldId: assignedFieldId },
              });
            }

            for (const valueUpdate of values) {
              const field = fieldsById.get(valueUpdate.fieldId);

              if (!field) {
                throw new ApplicationError({
                  code: "asset_custom_field.value.not_assigned",
                  kind: "validation",
                  message: "asset custom field is not assigned to asset",
                  details: { assetId, fieldId: valueUpdate.fieldId },
                });
              }

              if (
                valueUpdate.value !== null &&
                !isValidValueForDefinition(field, valueUpdate.value)
              ) {
                throw new ApplicationError({
                  code: "asset_custom_field.value.invalid",
                  kind: "validation",
                  message: "invalid asset custom field value",
                  details: {
                    assetId,
                    fieldId: valueUpdate.fieldId,
                    fieldKey: field.key,
                  },
                });
              }
            }

            await requireAuditActor(trx, performedBy);
            return await assetCustomFieldPersistence.replaceValues(trx, {
              assetId,
              values,
              audit: { updatedAt: new Date(), updatedBy: performedBy },
              previous,
            });
          });

        if (!updated) {
          logger.debug(`asset with id ${assetId} not found`);
          return null;
        }

        return {
          values: updated.values,
          previous: updated.previous,
          current: updated.current,
          changed: !assetSnapshotsEqual(updated.previous, updated.current),
          performedBy,
        };
      } catch (error) {
        if (isApplicationError(error)) {
          throw error;
        }

        logger.error(error, `failed to replace asset custom field values for asset ${assetId}`);
        throw new ApplicationError({
          code: "asset_custom_field.value.replace_failed",
          kind: "unexpected",
          message: "failed to replace asset custom field values",
          cause: error,
          details: { assetId },
        });
      }
    },
  };
}
