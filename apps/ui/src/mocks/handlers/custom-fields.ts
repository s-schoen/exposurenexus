import {
  AssetCustomFieldType,
  createAssetCustomFieldDefinitionSchema,
  updateAssetCustomFieldDefinitionSchema,
} from "@exposurenexus/contracts/model/asset-custom-field";
import { delay, http } from "msw";

import { apiPath, newId } from "@/mocks/handlers/shared.ts";
import { parseRequestBody, replyArray, replyNotFound, replyObject } from "@/mocks/reply.ts";

import type { MockDb } from "@/mocks/db.ts";
import type {
  AssetCustomFieldDefinition,
  CreateAssetCustomFieldDefinition,
  UpdateAssetCustomFieldDefinition,
} from "@exposurenexus/contracts/model/asset-custom-field";

function toDefinition(
  id: string,
  input: CreateAssetCustomFieldDefinition | UpdateAssetCustomFieldDefinition,
  existing?: AssetCustomFieldDefinition,
): AssetCustomFieldDefinition {
  const base = { id, key: input.key.trim(), name: input.name, required: input.required };

  switch (input.type) {
    case AssetCustomFieldType.Text:
      return { ...base, type: input.type, defaultValue: input.defaultValue ?? null };
    case AssetCustomFieldType.Number:
      return { ...base, type: input.type, defaultValue: input.defaultValue ?? null };
    case AssetCustomFieldType.Select: {
      // Keep option ids stable for values that survive an update.
      const existingOptions =
        existing?.type === AssetCustomFieldType.Select ? existing.options : [];
      return {
        ...base,
        type: input.type,
        defaultValue: input.defaultValue ?? null,
        options: input.options.map((option) => ({
          ...option,
          id:
            existingOptions.find((candidate) => candidate.value === option.value)?.id ??
            newId("customFieldOption"),
          fieldId: id,
        })),
      };
    }
  }
}

// Registered before the asset handlers: `/assets/:id` would otherwise match `/assets/custom-fields`.
export function createCustomFieldHandlers(db: MockDb) {
  return [
    http.get(apiPath("/assets/custom-fields"), async () => {
      await delay();
      return replyArray(db.customFields.all());
    }),

    http.post(apiPath("/assets/custom-fields"), async ({ request }) => {
      await delay();
      const body = await parseRequestBody(request, createAssetCustomFieldDefinitionSchema);
      if ("reply" in body) {
        return body.reply;
      }
      const definition = toDefinition(newId("customField"), body.data);
      db.customFields.insert(definition);
      return replyObject(definition, { created: true });
    }),

    http.get<{ id: string }>(apiPath("/assets/custom-fields/:id"), async ({ params }) => {
      await delay();
      const definition = db.customFields.get(params.id);
      return definition ? replyObject(definition) : replyNotFound("custom field");
    }),

    http.put<{ id: string }>(apiPath("/assets/custom-fields/:id"), async ({ params, request }) => {
      await delay();
      const existing = db.customFields.get(params.id);
      if (!existing) {
        return replyNotFound("custom field");
      }
      const body = await parseRequestBody(request, updateAssetCustomFieldDefinitionSchema);
      if ("reply" in body) {
        return body.reply;
      }
      const definition = toDefinition(params.id, body.data, existing);
      db.customFields.insert(definition);
      return replyObject(definition);
    }),

    http.delete<{ id: string }>(apiPath("/assets/custom-fields/:id"), async ({ params }) => {
      await delay();
      const definition = db.customFields.remove(params.id);
      if (!definition) {
        return replyNotFound("custom field");
      }
      for (const assignments of db.customFieldAssignments.values()) {
        assignments.delete(definition.id);
      }
      return replyObject(definition);
    }),
  ];
}
