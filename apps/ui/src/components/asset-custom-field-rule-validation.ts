import {
  AssetCustomFieldRuleViolationReason,
  AssetCustomFieldType,
  validateAssetCustomFieldDefinitionRules,
} from "@exposurenexus/types/model/asset-custom-field";

import type {
  CreateAssetCustomFieldDefinition,
  UpdateAssetCustomFieldDefinition,
} from "@exposurenexus/types/model/asset-custom-field";

interface AssetCustomFieldFormRuleOptionValue {
  value: string;
  label: string;
}

interface AssetCustomFieldFormRuleValues {
  name: string;
  key: string;
  type: AssetCustomFieldType;
  required: boolean;
  defaultValue: string;
  options: Array<AssetCustomFieldFormRuleOptionValue>;
}

type AssetCustomFieldRuleValidationSurface = "form" | "detail";

export interface AssetCustomFieldRuleValidationIssue {
  reason: AssetCustomFieldRuleViolationReason;
  path: ReadonlyArray<string | number>;
  message: string;
}

export function assetCustomFieldRuleViolationMessage(
  reason: AssetCustomFieldRuleViolationReason,
  surface: AssetCustomFieldRuleValidationSurface,
): string {
  switch (reason) {
    case AssetCustomFieldRuleViolationReason.ReservedKey:
      return "This key is reserved for core asset metadata";
    case AssetCustomFieldRuleViolationReason.RequiredDefaultMissing:
      return "Required fields need a default value";
    case AssetCustomFieldRuleViolationReason.TextDefaultMustBeString:
      return "Default value must be text";
    case AssetCustomFieldRuleViolationReason.NumberDefaultMustBeNumber:
      return "Enter a valid number";
    case AssetCustomFieldRuleViolationReason.SelectDefaultMustBeString:
      return "Select a default from the available options";
    case AssetCustomFieldRuleViolationReason.SelectDefaultMustMatchOption:
      return surface === "detail"
        ? "Default value must match an available option"
        : "Select a default from the available options";
    case AssetCustomFieldRuleViolationReason.SelectOptionValuesMustBeUnique:
      return "Option values must be unique";
  }
}

function assetCustomFieldDefinitionPayloadFromFormValues(
  values: AssetCustomFieldFormRuleValues,
): UpdateAssetCustomFieldDefinition {
  const base = {
    name: values.name.trim(),
    key: values.key.trim(),
    required: values.required,
  };
  const defaultValue = values.defaultValue.trim();

  switch (values.type) {
    case AssetCustomFieldType.Text:
      return {
        ...base,
        type: AssetCustomFieldType.Text,
        defaultValue: defaultValue === "" ? null : values.defaultValue,
      };
    case AssetCustomFieldType.Number:
      return {
        ...base,
        type: AssetCustomFieldType.Number,
        defaultValue: defaultValue === "" ? null : Number(defaultValue),
      };
    case AssetCustomFieldType.Select:
      return {
        ...base,
        type: AssetCustomFieldType.Select,
        defaultValue: defaultValue === "" ? null : defaultValue,
        options: values.options.map((option) => ({
          value: option.value.trim(),
          label: option.label.trim(),
        })),
      };
  }
}

export function createAssetCustomFieldDefinitionPayloadFromFormValues(
  values: AssetCustomFieldFormRuleValues,
): CreateAssetCustomFieldDefinition {
  return assetCustomFieldDefinitionPayloadFromFormValues(values);
}

export function updateAssetCustomFieldDefinitionPayloadFromFormValues(
  values: AssetCustomFieldFormRuleValues,
): UpdateAssetCustomFieldDefinition {
  return assetCustomFieldDefinitionPayloadFromFormValues(values);
}

export function validateAssetCustomFieldRulePayload(
  definition: CreateAssetCustomFieldDefinition | UpdateAssetCustomFieldDefinition,
  surface: AssetCustomFieldRuleValidationSurface,
): Array<AssetCustomFieldRuleValidationIssue> {
  return validateAssetCustomFieldDefinitionRules(definition).map((violation) => ({
    ...violation,
    message: assetCustomFieldRuleViolationMessage(violation.reason, surface),
  }));
}

export function validateAssetCustomFieldFormRuleValues(
  values: AssetCustomFieldFormRuleValues,
): Array<AssetCustomFieldRuleValidationIssue> {
  return validateAssetCustomFieldRulePayload(
    assetCustomFieldDefinitionPayloadFromFormValues(values),
    "form",
  );
}
