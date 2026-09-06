import {
  AssetCustomFieldRuleViolationReason,
  AssetCustomFieldType,
} from "@exposurenexus/contracts/model/asset-custom-field";
import { describe, expect, it } from "vitest";

import {
  assetCustomFieldRuleViolationMessage,
  createAssetCustomFieldDefinitionPayloadFromFormValues,
  updateAssetCustomFieldDefinitionPayloadFromFormValues,
  validateAssetCustomFieldFormRuleValues,
  validateAssetCustomFieldRulePayload,
} from "@/features/custom-fields/components/asset-custom-field-rule-validation.ts";

import type {
  CreateAssetCustomFieldDefinition,
  UpdateAssetCustomFieldDefinition,
} from "@exposurenexus/contracts/model/asset-custom-field";

const textFormValues = {
  name: "  Category  ",
  key: "  category  ",
  type: AssetCustomFieldType.Text,
  required: false,
  defaultValue: "  Security  ",
  options: [{ value: "ignored", label: "Ignored" }],
};

const violationMessages: Record<
  AssetCustomFieldRuleViolationReason,
  { form: string; detail: string }
> = {
  [AssetCustomFieldRuleViolationReason.ReservedKey]: {
    form: "This key is reserved for core asset metadata",
    detail: "This key is reserved for core asset metadata",
  },
  [AssetCustomFieldRuleViolationReason.RequiredDefaultMissing]: {
    form: "Required fields need a default value",
    detail: "Required fields need a default value",
  },
  [AssetCustomFieldRuleViolationReason.TextDefaultMustBeString]: {
    form: "Default value must be text",
    detail: "Default value must be text",
  },
  [AssetCustomFieldRuleViolationReason.NumberDefaultMustBeNumber]: {
    form: "Enter a valid number",
    detail: "Enter a valid number",
  },
  [AssetCustomFieldRuleViolationReason.SelectDefaultMustBeString]: {
    form: "Select a default from the available options",
    detail: "Select a default from the available options",
  },
  [AssetCustomFieldRuleViolationReason.SelectDefaultMustMatchOption]: {
    form: "Select a default from the available options",
    detail: "Default value must match an available option",
  },
  [AssetCustomFieldRuleViolationReason.SelectOptionValuesMustBeUnique]: {
    form: "Option values must be unique",
    detail: "Option values must be unique",
  },
};

describe("asset custom-field rule validation adapter", () => {
  it.each(Object.values(AssetCustomFieldRuleViolationReason))(
    "formats the %s reason for both UI surfaces",
    (reason) => {
      expect(assetCustomFieldRuleViolationMessage(reason, "form")).toBe(
        violationMessages[reason].form,
      );
      expect(assetCustomFieldRuleViolationMessage(reason, "detail")).toBe(
        violationMessages[reason].detail,
      );
    },
  );

  it("maps trimmed keys and names while preserving nonblank text defaults", () => {
    const expected = {
      name: "Category",
      key: "category",
      type: AssetCustomFieldType.Text,
      required: false,
      defaultValue: "  Security  ",
    } satisfies UpdateAssetCustomFieldDefinition;

    expect(createAssetCustomFieldDefinitionPayloadFromFormValues(textFormValues)).toEqual(expected);
    expect(updateAssetCustomFieldDefinitionPayloadFromFormValues(textFormValues)).toEqual(expected);
  });

  it.each([
    [AssetCustomFieldType.Text, null],
    [AssetCustomFieldType.Number, null],
    [AssetCustomFieldType.Select, null],
  ])("maps a blank %s default to null", (type, defaultValue) => {
    const values = {
      ...textFormValues,
      type,
      defaultValue: "",
      options:
        type === AssetCustomFieldType.Select ? [{ value: "production", label: "Production" }] : [],
    };

    expect(createAssetCustomFieldDefinitionPayloadFromFormValues(values)).toMatchObject({
      type,
      defaultValue,
    });
  });

  it("preserves a numeric zero default instead of treating it as blank", () => {
    const values = {
      ...textFormValues,
      type: AssetCustomFieldType.Number,
      defaultValue: "0",
    };

    expect(createAssetCustomFieldDefinitionPayloadFromFormValues(values)).toEqual({
      name: "Category",
      key: "category",
      type: AssetCustomFieldType.Number,
      required: false,
      defaultValue: 0,
    });
  });

  it("trims select option values and labels for both payload operations", () => {
    const values = {
      ...textFormValues,
      type: AssetCustomFieldType.Select,
      defaultValue: " production ",
      options: [
        { value: " production ", label: " Production " },
        { value: "staging", label: "Staging" },
      ],
    };
    const expected = {
      name: "Category",
      key: "category",
      type: AssetCustomFieldType.Select,
      required: false,
      defaultValue: "production",
      options: [
        { value: "production", label: "Production" },
        { value: "staging", label: "Staging" },
      ],
    };

    expect(createAssetCustomFieldDefinitionPayloadFromFormValues(values)).toEqual(expected);
    expect(updateAssetCustomFieldDefinitionPayloadFromFormValues(values)).toEqual(expected);
  });

  it.each([
    [
      AssetCustomFieldRuleViolationReason.ReservedKey,
      {
        key: "type",
        name: "Type",
        required: false,
        type: AssetCustomFieldType.Text,
        defaultValue: null,
      },
      ["key"],
    ],
    [
      AssetCustomFieldRuleViolationReason.RequiredDefaultMissing,
      {
        key: "category",
        name: "Category",
        required: true,
        type: AssetCustomFieldType.Text,
        defaultValue: null,
      },
      ["defaultValue"],
    ],
    [
      AssetCustomFieldRuleViolationReason.TextDefaultMustBeString,
      {
        key: "category",
        name: "Category",
        required: false,
        type: AssetCustomFieldType.Text,
        defaultValue: 5,
      } as never,
      ["defaultValue"],
    ],
    [
      AssetCustomFieldRuleViolationReason.NumberDefaultMustBeNumber,
      {
        key: "priority",
        name: "Priority",
        required: false,
        type: AssetCustomFieldType.Number,
        defaultValue: "high",
      } as never,
      ["defaultValue"],
    ],
    [
      AssetCustomFieldRuleViolationReason.SelectDefaultMustBeString,
      {
        key: "deployment_tier",
        name: "Deployment tier",
        required: false,
        type: AssetCustomFieldType.Select,
        defaultValue: 5,
        options: [{ value: "production", label: "Production" }],
      } as never,
      ["defaultValue"],
    ],
    [
      AssetCustomFieldRuleViolationReason.SelectDefaultMustMatchOption,
      {
        key: "deployment_tier",
        name: "Deployment tier",
        required: false,
        type: AssetCustomFieldType.Select,
        defaultValue: "development",
        options: [{ value: "production", label: "Production" }],
      },
      ["defaultValue"],
    ],
    [
      AssetCustomFieldRuleViolationReason.SelectOptionValuesMustBeUnique,
      {
        key: "deployment_tier",
        name: "Deployment tier",
        required: false,
        type: AssetCustomFieldType.Select,
        defaultValue: null,
        options: [
          { value: "production", label: "Production" },
          { value: "production", label: "Prod" },
        ],
      },
      ["options"],
    ],
  ])("maps %s to its UI path and form message", (reason, definition, path) => {
    const issue = validateAssetCustomFieldRulePayload(
      definition as CreateAssetCustomFieldDefinition,
      "form",
    );

    expect(issue).toEqual([
      {
        reason,
        path,
        message: violationMessages[reason].form,
      },
    ]);
  });

  it("uses the detail-specific message for an unmatched select default", () => {
    const issue = validateAssetCustomFieldRulePayload(
      {
        key: "deployment_tier",
        name: "Deployment tier",
        required: false,
        type: AssetCustomFieldType.Select,
        defaultValue: "development",
        options: [{ value: "production", label: "Production" }],
      },
      "detail",
    );

    expect(issue).toEqual([
      {
        reason: AssetCustomFieldRuleViolationReason.SelectDefaultMustMatchOption,
        path: ["defaultValue"],
        message: "Default value must match an available option",
      },
    ]);
  });

  it("trims form values before checking reserved keys and returns the adapter issue", () => {
    expect(
      validateAssetCustomFieldFormRuleValues({
        ...textFormValues,
        key: "  environment  ",
        defaultValue: "",
      }),
    ).toEqual([
      {
        reason: AssetCustomFieldRuleViolationReason.ReservedKey,
        path: ["key"],
        message: "This key is reserved for core asset metadata",
      },
    ]);
  });
});
