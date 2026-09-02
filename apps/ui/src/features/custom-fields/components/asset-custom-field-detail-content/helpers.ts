import { AssetCustomFieldType } from "@exposurenexus/contracts/model/asset-custom-field";

import type { AssetCustomFieldDefinition } from "@exposurenexus/contracts/model/asset-custom-field";

export interface CustomFieldSummary {
  typeLabel: string;
  defaultValue: string;
  optionCount: string;
}

/** Converts the persisted field type enum into the label shown in detail views. */
export function formatTypeLabel(type: AssetCustomFieldType): string {
  switch (type) {
    case AssetCustomFieldType.Text:
      return "Text";
    case AssetCustomFieldType.Number:
      return "Number";
    case AssetCustomFieldType.Select:
      return "Select";
  }
}

/** Formats the stored default value for read-only display, resolving select values to option labels. */
export function formatDefaultValue(field: AssetCustomFieldDefinition): string {
  if (field.defaultValue === null) {
    return "None";
  }

  if (field.type === AssetCustomFieldType.Select) {
    const matchingOption = field.options.find((option) => option.value === field.defaultValue);

    return matchingOption?.label ?? field.defaultValue;
  }

  return String(field.defaultValue);
}

/** Returns the select option count label, or "N/A" for field types without options. */
export function formatOptionCount(field: AssetCustomFieldDefinition): string {
  if (field.type !== AssetCustomFieldType.Select) {
    return "N/A";
  }

  return `${field.options.length} option${field.options.length === 1 ? "" : "s"}`;
}

/** Builds the display-only values reused by the overview, definition card, and sidebar. */
export function summarizeCustomField(field: AssetCustomFieldDefinition): CustomFieldSummary {
  return {
    typeLabel: formatTypeLabel(field.type),
    defaultValue: formatDefaultValue(field),
    optionCount: formatOptionCount(field),
  };
}
