import { describe, expect, it } from "vitest";

import {
  ASSET_CUSTOM_FIELD_RESERVED_KEYS,
  AssetCustomFieldRuleViolationReason,
  AssetCustomFieldType,
  AssetCustomFieldValueSource,
  assetCustomFieldDefinitionSchema,
  assetCustomFieldKeySchema,
  assetCustomFieldOptionSchema,
  assetCustomFieldValueLiteralSchema,
  assetCustomFieldValueSchema,
  createAssetCustomFieldDefinitionSchema,
  createAssetCustomFieldOptionSchema,
  createNumberAssetCustomFieldDefinitionSchema,
  createSelectAssetCustomFieldDefinitionSchema,
  createTextAssetCustomFieldDefinitionSchema,
  numberAssetCustomFieldDefinitionSchema,
  numberAssetCustomFieldValueSchema,
  selectAssetCustomFieldDefinitionSchema,
  selectAssetCustomFieldValueSchema,
  textAssetCustomFieldDefinitionSchema,
  textAssetCustomFieldValueSchema,
  updateAssetCustomFieldAssociationsSchema,
  updateAssetCustomFieldDefinitionSchema,
  updateAssetCustomFieldValueSchema,
  updateAssetCustomFieldValuesSchema,
  updateNumberAssetCustomFieldDefinitionSchema,
  updateSelectAssetCustomFieldDefinitionSchema,
  updateTextAssetCustomFieldDefinitionSchema,
  validateAssetCustomFieldDefinitionRules,
} from "./asset-custom-field.js";

import type { CreateAssetCustomFieldDefinition } from "./asset-custom-field.js";

const FIELD_ID = "5bde818a-bb4f-4a0f-a5eb-a190d5142a25";
const SECOND_FIELD_ID = "76b1885f-2d28-4b7d-93da-2751ff385aa3";
const OPTION_ID = "2db67190-9d84-482f-9936-cfbf4244752b";
const SECOND_OPTION_ID = "f4b28e50-f8e1-42f8-a610-50b7a7f96d9d";

const textDefinition = {
  id: FIELD_ID,
  key: "category",
  name: "Category",
  required: false,
  type: AssetCustomFieldType.Text,
  defaultValue: null,
};

const numberDefinition = {
  id: SECOND_FIELD_ID,
  key: "priority",
  name: "Priority",
  required: true,
  type: AssetCustomFieldType.Number,
  defaultValue: 0,
};

const selectDefinition = {
  id: FIELD_ID,
  key: "deployment_tier",
  name: "Deployment tier",
  required: true,
  type: AssetCustomFieldType.Select,
  defaultValue: "prod",
  options: [
    {
      id: OPTION_ID,
      fieldId: FIELD_ID,
      value: "prod",
      label: "Production",
    },
    {
      id: SECOND_OPTION_ID,
      fieldId: FIELD_ID,
      value: "stage",
      label: "Staging",
    },
  ],
};

const createTextDefinition = {
  key: "category",
  name: "Category",
  required: false,
  type: AssetCustomFieldType.Text,
  defaultValue: null,
};

const createNumberDefinition = {
  key: "priority",
  name: "Priority",
  required: true,
  type: AssetCustomFieldType.Number,
  defaultValue: 0,
};

const createSelectDefinition = {
  key: "deployment_tier",
  name: "Deployment tier",
  required: true,
  type: AssetCustomFieldType.Select,
  defaultValue: "prod",
  options: [
    {
      value: "prod",
      label: "Production",
    },
    {
      value: "stage",
      label: "Staging",
    },
  ],
};

const textValue = {
  fieldId: FIELD_ID,
  key: "category",
  name: "Category",
  source: AssetCustomFieldValueSource.Asset,
  type: AssetCustomFieldType.Text,
  value: "platform",
};

const numberValue = {
  fieldId: SECOND_FIELD_ID,
  key: "priority",
  name: "Priority",
  source: AssetCustomFieldValueSource.Default,
  type: AssetCustomFieldType.Number,
  value: 0,
};

const selectValue = {
  fieldId: FIELD_ID,
  key: "deployment_tier",
  name: "Deployment tier",
  source: AssetCustomFieldValueSource.Empty,
  type: AssetCustomFieldType.Select,
  value: null,
  options: selectDefinition.options,
};

function violationReasons(
  definition: CreateAssetCustomFieldDefinition,
): AssetCustomFieldRuleViolationReason[] {
  return validateAssetCustomFieldDefinitionRules(definition).map((violation) => violation.reason);
}

describe("asset custom field key schema", () => {
  it("trims valid keys and accepts the supported length boundaries", () => {
    expect(assetCustomFieldKeySchema.parse("  deployment_tier  ")).toBe("deployment_tier");
    expect(assetCustomFieldKeySchema.parse("a")).toBe("a");
    expect(assetCustomFieldKeySchema.parse("a".repeat(64))).toHaveLength(64);
  });

  it.each([
    "",
    "   ",
    "a".repeat(65),
    "Deployment_tier",
    "1deployment_tier",
    "_deployment_tier",
    "deployment-tier",
    "deployment tier",
    "deployment.tier",
  ])("rejects invalid key %j", (key) => {
    expect(() => assetCustomFieldKeySchema.parse(key)).toThrow();
  });
});

describe("asset custom field option schemas", () => {
  it("accepts persisted options and create options", () => {
    const option = selectDefinition.options[0];

    expect(assetCustomFieldOptionSchema.parse(option)).toEqual(option);
    expect(
      createAssetCustomFieldOptionSchema.parse({ value: option.value, label: option.label }),
    ).toEqual({
      value: option.value,
      label: option.label,
    });
  });

  it.each([
    ["an invalid option id", { ...selectDefinition.options[0], id: "not-a-uuid" }],
    ["an invalid field id", { ...selectDefinition.options[0], fieldId: "not-a-uuid" }],
    ["an empty value", { ...selectDefinition.options[0], value: "" }],
    ["an empty label", { ...selectDefinition.options[0], label: "" }],
    ["an unknown property", { ...selectDefinition.options[0], extra: true }],
  ])("rejects persisted options with %s", (_reason, option) => {
    expect(() => assetCustomFieldOptionSchema.parse(option)).toThrow();
  });

  it("rejects generated ids and unknown properties in create options", () => {
    expect(() =>
      createAssetCustomFieldOptionSchema.parse({
        value: "prod",
        label: "Production",
        id: OPTION_ID,
      }),
    ).toThrow();
    expect(() =>
      createAssetCustomFieldOptionSchema.parse({
        value: "prod",
        label: "Production",
        fieldId: FIELD_ID,
      }),
    ).toThrow();
    expect(() =>
      createAssetCustomFieldOptionSchema.parse({
        value: "prod",
        label: "Production",
        extra: true,
      }),
    ).toThrow();
  });
});

describe("asset custom field definition schemas", () => {
  it("accepts each persisted definition variant", () => {
    expect(textAssetCustomFieldDefinitionSchema.parse(textDefinition)).toEqual(textDefinition);
    expect(numberAssetCustomFieldDefinitionSchema.parse(numberDefinition)).toEqual(
      numberDefinition,
    );
    expect(selectAssetCustomFieldDefinitionSchema.parse(selectDefinition)).toEqual(
      selectDefinition,
    );

    expect(assetCustomFieldDefinitionSchema.parse(textDefinition)).toEqual(textDefinition);
    expect(assetCustomFieldDefinitionSchema.parse(numberDefinition)).toEqual(numberDefinition);
    expect(assetCustomFieldDefinitionSchema.parse(selectDefinition)).toEqual(selectDefinition);
  });

  it("rejects invalid persisted definition variants", () => {
    expect(() =>
      assetCustomFieldDefinitionSchema.parse({ ...textDefinition, id: "not-a-uuid" }),
    ).toThrow();
    expect(() => assetCustomFieldDefinitionSchema.parse({ ...textDefinition, name: "" })).toThrow();
    expect(() =>
      assetCustomFieldDefinitionSchema.parse({ ...textDefinition, required: "false" }),
    ).toThrow();
    expect(() =>
      assetCustomFieldDefinitionSchema.parse({ ...textDefinition, defaultValue: 5 }),
    ).toThrow();
    expect(() =>
      assetCustomFieldDefinitionSchema.parse({ ...numberDefinition, defaultValue: "high" }),
    ).toThrow();
    expect(() =>
      assetCustomFieldDefinitionSchema.parse({ ...selectDefinition, defaultValue: 5 }),
    ).toThrow();
    expect(() =>
      assetCustomFieldDefinitionSchema.parse({ ...selectDefinition, options: [] }),
    ).toThrow();
    expect(() =>
      assetCustomFieldDefinitionSchema.parse({ ...textDefinition, type: "boolean" }),
    ).toThrow();
    expect(() =>
      assetCustomFieldDefinitionSchema.parse({ ...textDefinition, extra: true }),
    ).toThrow();
  });

  it("accepts create definitions with optional defaults and generated select options", () => {
    const textWithoutDefault = {
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
    };

    expect(createTextAssetCustomFieldDefinitionSchema.parse(textWithoutDefault)).toEqual(
      textWithoutDefault,
    );
    expect(createNumberAssetCustomFieldDefinitionSchema.parse(createNumberDefinition)).toEqual(
      createNumberDefinition,
    );
    expect(createSelectAssetCustomFieldDefinitionSchema.parse(createSelectDefinition)).toEqual(
      createSelectDefinition,
    );
    expect(createAssetCustomFieldDefinitionSchema.parse(textWithoutDefault)).toEqual(
      textWithoutDefault,
    );
    expect(createAssetCustomFieldDefinitionSchema.parse(createNumberDefinition)).toEqual(
      createNumberDefinition,
    );
    expect(createAssetCustomFieldDefinitionSchema.parse(createSelectDefinition)).toEqual(
      createSelectDefinition,
    );
  });

  it("rejects definition ids and persisted option ids in create payloads", () => {
    expect(() =>
      createAssetCustomFieldDefinitionSchema.parse({ ...createTextDefinition, id: FIELD_ID }),
    ).toThrow();
    expect(() =>
      createAssetCustomFieldDefinitionSchema.parse({
        ...createSelectDefinition,
        options: [selectDefinition.options[0]],
      }),
    ).toThrow();
  });

  it("requires complete update definitions without generated ids", () => {
    const textUpdate = {
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: "platform",
    };

    expect(updateTextAssetCustomFieldDefinitionSchema.parse(textUpdate)).toEqual(textUpdate);
    expect(
      updateNumberAssetCustomFieldDefinitionSchema.parse({ ...createNumberDefinition }),
    ).toEqual(createNumberDefinition);
    expect(updateSelectAssetCustomFieldDefinitionSchema.parse(createSelectDefinition)).toEqual(
      createSelectDefinition,
    );
    expect(updateAssetCustomFieldDefinitionSchema.parse(textUpdate)).toEqual(textUpdate);
    expect(updateAssetCustomFieldDefinitionSchema.parse(createNumberDefinition)).toEqual(
      createNumberDefinition,
    );
    expect(updateAssetCustomFieldDefinitionSchema.parse(createSelectDefinition)).toEqual(
      createSelectDefinition,
    );

    expect(() =>
      updateAssetCustomFieldDefinitionSchema.parse({
        ...textUpdate,
        defaultValue: undefined,
      }),
    ).toThrow();
    expect(() =>
      updateAssetCustomFieldDefinitionSchema.parse({ ...textUpdate, id: FIELD_ID }),
    ).toThrow();
    expect(() =>
      updateAssetCustomFieldDefinitionSchema.parse({
        ...createSelectDefinition,
        options: [selectDefinition.options[0]],
      }),
    ).toThrow();
  });
});

describe("asset custom field value schemas", () => {
  it("accepts each effective value variant", () => {
    expect(textAssetCustomFieldValueSchema.parse(textValue)).toEqual(textValue);
    expect(numberAssetCustomFieldValueSchema.parse(numberValue)).toEqual(numberValue);
    expect(selectAssetCustomFieldValueSchema.parse(selectValue)).toEqual(selectValue);

    expect(assetCustomFieldValueSchema.parse(textValue)).toEqual(textValue);
    expect(assetCustomFieldValueSchema.parse(numberValue)).toEqual(numberValue);
    expect(assetCustomFieldValueSchema.parse(selectValue)).toEqual(selectValue);
  });

  it("accepts every effective value source", () => {
    for (const source of [
      AssetCustomFieldValueSource.Asset,
      AssetCustomFieldValueSource.Default,
      AssetCustomFieldValueSource.Empty,
    ]) {
      expect(
        assetCustomFieldValueSchema.parse({
          ...textValue,
          source,
          value: null,
        }),
      ).toEqual({ ...textValue, source, value: null });
    }
  });

  it("accepts nullable values and rejects mismatched value variants", () => {
    expect(assetCustomFieldValueSchema.parse({ ...textValue, value: null })).toMatchObject({
      type: AssetCustomFieldType.Text,
      value: null,
    });
    expect(assetCustomFieldValueSchema.parse({ ...numberValue, value: null })).toMatchObject({
      type: AssetCustomFieldType.Number,
      value: null,
    });

    expect(() => assetCustomFieldValueSchema.parse({ ...textValue, value: 5 })).toThrow();
    expect(() => assetCustomFieldValueSchema.parse({ ...numberValue, value: "high" })).toThrow();
    expect(() => assetCustomFieldValueSchema.parse({ ...selectValue, value: 5 })).toThrow();
    expect(() => assetCustomFieldValueSchema.parse({ ...selectValue, options: [] })).toThrow();
    expect(() => assetCustomFieldValueSchema.parse({ ...textValue, source: "manual" })).toThrow();
    expect(() =>
      assetCustomFieldValueSchema.parse({ ...textValue, fieldId: "not-a-uuid" }),
    ).toThrow();
    expect(() => assetCustomFieldValueSchema.parse({ ...textValue, extra: true })).toThrow();
  });

  it("trims effective value keys through the shared key schema", () => {
    expect(assetCustomFieldValueSchema.parse({ ...textValue, key: "  category  " })).toMatchObject({
      key: "category",
    });
  });
});

describe("asset custom field value literal schema", () => {
  it("accepts strings, numbers, and null", () => {
    expect(assetCustomFieldValueLiteralSchema.parse("")).toBe("");
    expect(assetCustomFieldValueLiteralSchema.parse("platform")).toBe("platform");
    expect(assetCustomFieldValueLiteralSchema.parse(0)).toBe(0);
    expect(assetCustomFieldValueLiteralSchema.parse(null)).toBeNull();
  });

  it.each([true, false, {}, [], undefined, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects non-literal value %j",
    (value) => {
      expect(() => assetCustomFieldValueLiteralSchema.parse(value)).toThrow();
    },
  );
});

describe("asset custom field mutation schemas", () => {
  it("accepts value replacements, empty replacements, and association replacements", () => {
    expect(
      updateAssetCustomFieldValueSchema.parse({ fieldId: FIELD_ID, value: "platform" }),
    ).toEqual({
      fieldId: FIELD_ID,
      value: "platform",
    });
    expect(updateAssetCustomFieldValueSchema.parse({ fieldId: FIELD_ID, value: 0 })).toEqual({
      fieldId: FIELD_ID,
      value: 0,
    });
    expect(updateAssetCustomFieldValueSchema.parse({ fieldId: FIELD_ID, value: null })).toEqual({
      fieldId: FIELD_ID,
      value: null,
    });
    expect(updateAssetCustomFieldValuesSchema.parse({ values: [] })).toEqual({ values: [] });
    expect(
      updateAssetCustomFieldValuesSchema.parse({
        values: [
          { fieldId: FIELD_ID, value: "platform" },
          { fieldId: SECOND_FIELD_ID, value: null },
        ],
      }),
    ).toEqual({
      values: [
        { fieldId: FIELD_ID, value: "platform" },
        { fieldId: SECOND_FIELD_ID, value: null },
      ],
    });
    expect(
      updateAssetCustomFieldAssociationsSchema.parse({
        fieldIds: [FIELD_ID, FIELD_ID],
      }),
    ).toEqual({ fieldIds: [FIELD_ID, FIELD_ID] });
  });

  it("rejects malformed value and association replacements", () => {
    expect(() =>
      updateAssetCustomFieldValueSchema.parse({ fieldId: "not-a-uuid", value: "platform" }),
    ).toThrow();
    expect(() =>
      updateAssetCustomFieldValueSchema.parse({ fieldId: FIELD_ID, value: true }),
    ).toThrow();
    expect(() =>
      updateAssetCustomFieldValueSchema.parse({ fieldId: FIELD_ID, value: Number.NaN }),
    ).toThrow();
    expect(() =>
      updateAssetCustomFieldValueSchema.parse({
        fieldId: FIELD_ID,
        value: "platform",
        extra: true,
      }),
    ).toThrow();
    expect(() =>
      updateAssetCustomFieldValuesSchema.parse({
        values: [{ fieldId: "not-a-uuid", value: null }],
      }),
    ).toThrow();
    expect(() => updateAssetCustomFieldValuesSchema.parse({ values: [], extra: true })).toThrow();
    expect(() =>
      updateAssetCustomFieldAssociationsSchema.parse({ fieldIds: ["not-a-uuid"] }),
    ).toThrow();
    expect(() =>
      updateAssetCustomFieldAssociationsSchema.parse({ fieldIds: [FIELD_ID], extra: true }),
    ).toThrow();
  });
});

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
        defaultValue: 0,
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

  it.each([undefined, null])(
    "treats an omitted or null default as missing for required fields",
    (defaultValue) => {
      const definition = {
        key: "category",
        name: "Category",
        required: true,
        type: AssetCustomFieldType.Text,
        ...(defaultValue === undefined ? {} : { defaultValue }),
      } as CreateAssetCustomFieldDefinition;

      expect(validateAssetCustomFieldDefinitionRules(definition)).toEqual([
        {
          reason: AssetCustomFieldRuleViolationReason.RequiredDefaultMissing,
          path: ["defaultValue"],
        },
      ]);
    },
  );

  it("reports typed default violations at the default value path", () => {
    expect(
      validateAssetCustomFieldDefinitionRules({
        key: "category",
        name: "Category",
        required: false,
        type: AssetCustomFieldType.Text,
        defaultValue: 5 as never,
      }),
    ).toEqual([
      {
        reason: AssetCustomFieldRuleViolationReason.TextDefaultMustBeString,
        path: ["defaultValue"],
      },
    ]);
    expect(
      validateAssetCustomFieldDefinitionRules({
        key: "priority",
        name: "Priority",
        required: false,
        type: AssetCustomFieldType.Number,
        defaultValue: "high" as never,
      }),
    ).toEqual([
      {
        reason: AssetCustomFieldRuleViolationReason.NumberDefaultMustBeNumber,
        path: ["defaultValue"],
      },
    ]);
    expect(
      validateAssetCustomFieldDefinitionRules({
        key: "deployment_tier",
        name: "Deployment tier",
        required: false,
        type: AssetCustomFieldType.Select,
        defaultValue: 5 as never,
        options: [{ value: "prod", label: "Production" }],
      }),
    ).toEqual([
      {
        reason: AssetCustomFieldRuleViolationReason.SelectDefaultMustBeString,
        path: ["defaultValue"],
      },
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

  it("short-circuits reserved-key and required-default violations", () => {
    expect(
      validateAssetCustomFieldDefinitionRules({
        key: "type",
        name: "Type",
        required: true,
        type: AssetCustomFieldType.Text,
        defaultValue: 5 as never,
      }),
    ).toEqual([
      {
        reason: AssetCustomFieldRuleViolationReason.ReservedKey,
        path: ["key"],
      },
    ]);

    expect(
      validateAssetCustomFieldDefinitionRules({
        key: "deployment_tier",
        name: "Deployment tier",
        required: true,
        type: AssetCustomFieldType.Select,
        options: [
          { value: "prod", label: "Production" },
          { value: "prod", label: "Prod" },
        ],
      }),
    ).toEqual([
      {
        reason: AssetCustomFieldRuleViolationReason.RequiredDefaultMissing,
        path: ["defaultValue"],
      },
    ]);
  });

  it("reports select option violations in stable order", () => {
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

    expect(
      violationReasons({
        key: "deployment_tier",
        name: "Deployment tier",
        required: false,
        type: AssetCustomFieldType.Select,
        defaultValue: "dev",
        options: [
          { value: "prod", label: "Production" },
          { value: "prod", label: "Prod" },
        ],
      }),
    ).toEqual([
      AssetCustomFieldRuleViolationReason.SelectOptionValuesMustBeUnique,
      AssetCustomFieldRuleViolationReason.SelectDefaultMustMatchOption,
    ]);
  });

  it("validates reserved keys after schema normalization", () => {
    const parsed = createAssetCustomFieldDefinitionSchema.parse({
      key: "  environment  ",
      name: "Environment",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: null,
    });

    expect(parsed.key).toBe("environment");
    expect(validateAssetCustomFieldDefinitionRules(parsed)).toEqual([
      {
        reason: AssetCustomFieldRuleViolationReason.ReservedKey,
        path: ["key"],
      },
    ]);
  });
});
