import {
  AssetCustomFieldRuleViolationReason,
  AssetCustomFieldType,
  type CreateAssetCustomFieldDefinition,
} from "@exposurenexus/contracts/model/asset-custom-field";
import { describe, expect, it } from "vitest";

import { ASSET_CUSTOM_FIELD_RESERVED_KEYS } from "./custom-field-rules.js";
import { validateAssetCustomFieldDefinitionRules } from "./custom-field-rules.js";

function violationReasons(
  definition: CreateAssetCustomFieldDefinition,
): AssetCustomFieldRuleViolationReason[] {
  return validateAssetCustomFieldDefinitionRules(definition).map((violation) => violation.reason);
}

describe("asset custom field definition rules", () => {
  it("accepts valid text, number, and select definitions", () => {
    expect(
      validateAssetCustomFieldDefinitionRules({
        key: "category",
        name: "Category",
        required: false,
        type: AssetCustomFieldType.Text,
      }),
    ).toEqual([]);
    expect(
      validateAssetCustomFieldDefinitionRules({
        key: "priority",
        name: "Priority",
        required: true,
        type: AssetCustomFieldType.Number,
        defaultValue: 1,
      }),
    ).toEqual([]);
    expect(
      validateAssetCustomFieldDefinitionRules({
        key: "deployment_tier",
        name: "Deployment tier",
        required: true,
        type: AssetCustomFieldType.Select,
        defaultValue: "prod",
        options: [
          { value: "prod", label: "Production" },
          { value: "stage", label: "Staging" },
        ],
      }),
    ).toEqual([]);
  });

  it("treats omitted defaults as null for required fields", () => {
    expect(
      validateAssetCustomFieldDefinitionRules({
        key: "category",
        name: "Category",
        required: true,
        type: AssetCustomFieldType.Text,
      }),
    ).toEqual([
      {
        reason: AssetCustomFieldRuleViolationReason.RequiredDefaultMissing,
        path: ["defaultValue"],
      },
    ]);
  });

  it("reports typed default violations", () => {
    expect(
      violationReasons({
        key: "category",
        name: "Category",
        required: false,
        type: AssetCustomFieldType.Text,
        defaultValue: 5 as never,
      }),
    ).toEqual([AssetCustomFieldRuleViolationReason.TextDefaultMustBeString]);
    expect(
      violationReasons({
        key: "priority",
        name: "Priority",
        required: false,
        type: AssetCustomFieldType.Number,
        defaultValue: "high" as never,
      }),
    ).toEqual([AssetCustomFieldRuleViolationReason.NumberDefaultMustBeNumber]);
    expect(
      violationReasons({
        key: "deployment_tier",
        name: "Deployment tier",
        required: false,
        type: AssetCustomFieldType.Select,
        defaultValue: 5 as never,
        options: [{ value: "prod", label: "Production" }],
      }),
    ).toEqual([AssetCustomFieldRuleViolationReason.SelectDefaultMustBeString]);
  });

  it("reports select option rule violations in API-compatible order", () => {
    expect(
      violationReasons({
        key: "deployment_tier",
        name: "Deployment tier",
        required: false,
        type: AssetCustomFieldType.Select,
        defaultValue: 5 as never,
        options: [
          { value: "prod", label: "Production" },
          { value: "prod", label: "Prod" },
        ],
      }),
    ).toEqual([
      AssetCustomFieldRuleViolationReason.SelectOptionValuesMustBeUnique,
      AssetCustomFieldRuleViolationReason.SelectDefaultMustBeString,
    ]);
  });

  it("requires select defaults to match an option value", () => {
    expect(
      validateAssetCustomFieldDefinitionRules({
        key: "deployment_tier",
        name: "Deployment tier",
        required: false,
        type: AssetCustomFieldType.Select,
        defaultValue: "dev",
        options: [{ value: "prod", label: "Production" }],
      }),
    ).toEqual([
      {
        reason: AssetCustomFieldRuleViolationReason.SelectDefaultMustMatchOption,
        path: ["defaultValue"],
      },
    ]);
  });

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
