import {
  AssetCustomFieldRuleViolationReason,
  AssetCustomFieldType,
  createAssetCustomFieldDefinitionSchema,
  updateAssetCustomFieldDefinitionSchema,
} from "@exposurenexus/contracts/model/asset-custom-field";
import { PermissionResource, PermissionVerb } from "@exposurenexus/contracts/model/rbac";
import { delay, http } from "msw";

import { validateAssetCustomFieldDefinitionRules } from "@/features/custom-fields/lib/custom-field-rules.ts";
import { listCustomFieldDefinitions } from "@/mocks/db.ts";
import { apiPath, newId, requirePermission } from "@/mocks/handlers/shared.ts";
import {
  parseRequestBody,
  replyArray,
  replyError,
  replyNotFound,
  replyObject,
} from "@/mocks/reply.ts";

import type { MockDb } from "@/mocks/db.ts";
import type {
  AssetCustomFieldDefinition,
  CreateAssetCustomFieldDefinition,
  UpdateAssetCustomFieldDefinition,
} from "@exposurenexus/contracts/model/asset-custom-field";

const { CustomField } = PermissionResource;
const { Read, Write, Delete } = PermissionVerb;

// The API's messages for definition rule violations; the violation reason is the reply's `reason`.
const RULE_VIOLATION_MESSAGES: Record<AssetCustomFieldRuleViolationReason, string> = {
  [AssetCustomFieldRuleViolationReason.ReservedKey]:
    "asset custom field key is reserved for core asset metadata",
  [AssetCustomFieldRuleViolationReason.RequiredDefaultMissing]:
    "required asset custom fields must define a default value",
  [AssetCustomFieldRuleViolationReason.TextDefaultMustBeString]:
    "text asset custom field default must be a string",
  [AssetCustomFieldRuleViolationReason.NumberDefaultMustBeNumber]:
    "number asset custom field default must be a number",
  [AssetCustomFieldRuleViolationReason.SelectDefaultMustBeString]:
    "select asset custom field default must be a string",
  [AssetCustomFieldRuleViolationReason.SelectDefaultMustMatchOption]:
    "select asset custom field default must match an option value",
  [AssetCustomFieldRuleViolationReason.SelectOptionValuesMustBeUnique]:
    "select asset custom field options must be unique",
};

/** Like the API, every save replaces the options, so each one gets a new id. */
function toDefinition(
  id: string,
  input: CreateAssetCustomFieldDefinition | UpdateAssetCustomFieldDefinition,
): AssetCustomFieldDefinition {
  const base = { id, key: input.key, name: input.name, required: input.required };

  switch (input.type) {
    case AssetCustomFieldType.Text:
      return { ...base, type: input.type, defaultValue: input.defaultValue ?? null };
    case AssetCustomFieldType.Number:
      return { ...base, type: input.type, defaultValue: input.defaultValue ?? null };
    case AssetCustomFieldType.Select:
      return {
        ...base,
        type: input.type,
        defaultValue: input.defaultValue ?? null,
        options: input.options
          .map((option) => ({ ...option, id: newId("customFieldOption"), fieldId: id }))
          .sort((a, b) => a.value.localeCompare(b.value)),
      };
  }
}

// Registered before the asset handlers: `/assets/:id` would otherwise match `/assets/custom-fields`.
export function createCustomFieldHandlers(db: MockDb) {
  const ruleViolation = (
    input: CreateAssetCustomFieldDefinition | UpdateAssetCustomFieldDefinition,
  ) => {
    const violation = validateAssetCustomFieldDefinitionRules(input).at(0);
    return violation
      ? replyError(400, RULE_VIOLATION_MESSAGES[violation.reason], violation.reason)
      : undefined;
  };
  /** The API's unique key constraint. */
  const keyConflict = (key: string, id?: string) =>
    db.customFields.all().some((field) => field.id !== id && field.key === key)
      ? replyError(409, "asset custom field definition already exists")
      : undefined;

  return [
    http.get(
      apiPath("/assets/custom-fields"),
      requirePermission(db, CustomField, Read, async () => {
        await delay();
        return replyArray(listCustomFieldDefinitions(db));
      }),
    ),

    // Creating a definition, required or not, assigns it to no asset.
    http.post(
      apiPath("/assets/custom-fields"),
      requirePermission(db, CustomField, Write, async ({ request }) => {
        await delay();
        const body = await parseRequestBody(request, createAssetCustomFieldDefinitionSchema);
        if ("reply" in body) {
          return body.reply;
        }
        const input = { ...body.data, key: body.data.key.trim() };
        const rejected = ruleViolation(input) ?? keyConflict(input.key);
        if (rejected) {
          return rejected;
        }
        const definition = toDefinition(newId("customField"), input);
        db.customFields.insert(definition);
        return replyObject(definition, { created: true });
      }),
    ),

    http.get<{ id: string }>(
      apiPath("/assets/custom-fields/:id"),
      requirePermission(db, CustomField, Read, async ({ params }) => {
        await delay();
        const definition = db.customFields.get(params.id);
        return definition ? replyObject(definition) : replyNotFound("custom field", params.id);
      }),
    ),

    http.put<{ id: string }>(
      apiPath("/assets/custom-fields/:id"),
      requirePermission(db, CustomField, Write, async ({ params, request }) => {
        await delay();
        const body = await parseRequestBody(request, updateAssetCustomFieldDefinitionSchema);
        if ("reply" in body) {
          return body.reply;
        }
        const input = { ...body.data, key: body.data.key.trim() };
        const violation = ruleViolation(input);
        if (violation) {
          return violation;
        }
        if (!db.customFields.get(params.id)) {
          return replyNotFound("custom field", params.id);
        }
        const conflict = keyConflict(input.key, params.id);
        if (conflict) {
          return conflict;
        }
        const definition = toDefinition(params.id, input);
        db.customFields.insert(definition);
        return replyObject(definition);
      }),
    ),

    // Assignments and per-asset values of the field cascade.
    http.delete<{ id: string }>(
      apiPath("/assets/custom-fields/:id"),
      requirePermission(db, CustomField, Delete, async ({ params }) => {
        await delay();
        const definition = db.customFields.remove(params.id);
        if (!definition) {
          return replyNotFound("custom field", params.id);
        }
        for (const assignments of db.customFieldAssignments.values()) {
          assignments.delete(definition.id);
        }
        return replyObject(definition);
      }),
    ),
  ];
}
