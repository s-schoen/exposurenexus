import {
  AssetCustomFieldRuleViolationReason,
  AssetCustomFieldType,
  ASSET_CUSTOM_FIELD_RESERVED_KEYS,
  validateAssetCustomFieldDefinitionRules,
} from "./asset-custom-field.js";
import { describe, expect, it } from "vitest";

describe("asset custom field definition rules", () => {
  it("rejects every core asset metadata key", () => {
    for (const key of ASSET_CUSTOM_FIELD_RESERVED_KEYS) {
      expect(
        validateAssetCustomFieldDefinitionRules({
          key,
          name: "Core metadata",
          required: false,
          type: AssetCustomFieldType.Text,
          defaultValue: null,
        }),
      ).toEqual([
        {
          reason: AssetCustomFieldRuleViolationReason.ReservedKey,
          path: ["key"],
        },
      ]);
    }
  });
});
