import { describe, expect, it } from "vitest";

import {
  createAssetCustomFieldDefinition,
  deleteAssetCustomFieldDefinition,
  getAssetCustomFieldDefinitionByID,
  listAssetCustomFieldDefinitions,
  updateAssetCustomFieldDefinition,
} from "@/features/custom-fields/api/definitions.ts";
import { APIError } from "@/lib/api-client.ts";
import { SEED_CUSTOM_FIELDS } from "@/mocks/fixtures/index.ts";
import { mockApiError, mockApiReply } from "@/test/msw.ts";

// Happy-path requests and bodies are covered by src/mocks/handlers/handlers.test.ts, whose
// handlers validate bodies with the contracts schemas. This covers error and reply handling.

const [, , DEPLOYMENT_TIER] = SEED_CUSTOM_FIELDS;
const [CATEGORY] = SEED_CUSTOM_FIELDS;
const { id, ...definition } = CATEGORY;

describe("asset custom field api", () => {
  it.each([
    ["list", "get", "/assets/custom-fields", () => listAssetCustomFieldDefinitions()],
    ["get", "get", "/assets/custom-fields/:id", () => getAssetCustomFieldDefinitionByID(id)],
    ["create", "post", "/assets/custom-fields", () => createAssetCustomFieldDefinition(definition)],
    [
      "update",
      "put",
      "/assets/custom-fields/:id",
      () => updateAssetCustomFieldDefinition(id, definition),
    ],
    ["delete", "delete", "/assets/custom-fields/:id", () => deleteAssetCustomFieldDefinition(id)],
  ] as const)("turns %s error replies into APIErrors", async (_name, method, path, call) => {
    mockApiError(method, path, 422, "Custom field endpoint rejected the request", "field-reason");

    const request = call();
    await expect(request).rejects.toBeInstanceOf(APIError);
    await expect(request).rejects.toMatchObject({
      statusCode: 422,
      message: "Custom field endpoint rejected the request",
      reason: "field-reason",
    });
  });

  it("rejects replies that break the definition contract", async () => {
    mockApiReply("get", "/assets/custom-fields", {
      data: { items: [{ ...DEPLOYMENT_TIER, options: [] }] },
    });

    await expect(listAssetCustomFieldDefinitions()).rejects.toThrow();
  });
});
