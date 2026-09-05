import {
  AssetCustomFieldType,
  AssetCustomFieldRuleViolationReason,
  type AssetCustomFieldRuleViolation,
  type CreateAssetCustomFieldDefinition,
  type UpdateAssetCustomFieldDefinition,
} from "@exposurenexus/contracts/model/asset-custom-field";
export const ASSET_CUSTOM_FIELD_RESERVED_KEYS = [
  "display_name",
  "type",
  "environment",
  "lifecycle_state",
  "owner_id",
  "identifiers",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
] as const;

const assetCustomFieldReservedKeys = new Set<string>(ASSET_CUSTOM_FIELD_RESERVED_KEYS);

function hasDuplicateAssetCustomFieldValues(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function getAssetCustomFieldDefaultValue(
  definition: CreateAssetCustomFieldDefinition | UpdateAssetCustomFieldDefinition,
): unknown {
  return definition.defaultValue ?? null;
}

export function validateAssetCustomFieldDefinitionRules(
  definition: CreateAssetCustomFieldDefinition | UpdateAssetCustomFieldDefinition,
): AssetCustomFieldRuleViolation[] {
  if (assetCustomFieldReservedKeys.has(definition.key)) {
    return [
      {
        reason: AssetCustomFieldRuleViolationReason.ReservedKey,
        path: ["key"],
      },
    ];
  }

  const defaultValue = getAssetCustomFieldDefaultValue(definition);

  if (definition.required && defaultValue === null) {
    return [
      {
        reason: AssetCustomFieldRuleViolationReason.RequiredDefaultMissing,
        path: ["defaultValue"],
      },
    ];
  }

  switch (definition.type) {
    case AssetCustomFieldType.Text:
      if (defaultValue !== null && typeof defaultValue !== "string") {
        return [
          {
            reason: AssetCustomFieldRuleViolationReason.TextDefaultMustBeString,
            path: ["defaultValue"],
          },
        ];
      }
      return [];
    case AssetCustomFieldType.Number:
      if (defaultValue !== null && typeof defaultValue !== "number") {
        return [
          {
            reason: AssetCustomFieldRuleViolationReason.NumberDefaultMustBeNumber,
            path: ["defaultValue"],
          },
        ];
      }
      return [];
    case AssetCustomFieldType.Select: {
      const optionValues = definition.options.map((option) => option.value);
      const violations: AssetCustomFieldRuleViolation[] = [];

      if (hasDuplicateAssetCustomFieldValues(optionValues)) {
        violations.push({
          reason: AssetCustomFieldRuleViolationReason.SelectOptionValuesMustBeUnique,
          path: ["options"],
        });
      }

      if (defaultValue !== null && typeof defaultValue !== "string") {
        violations.push({
          reason: AssetCustomFieldRuleViolationReason.SelectDefaultMustBeString,
          path: ["defaultValue"],
        });
        return violations;
      }

      if (defaultValue !== null && !optionValues.includes(defaultValue)) {
        violations.push({
          reason: AssetCustomFieldRuleViolationReason.SelectDefaultMustMatchOption,
          path: ["defaultValue"],
        });
      }

      return violations;
    }
  }
}
