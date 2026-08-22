import { AssetCustomFieldType } from "@exposurenexus/contracts/model/asset-custom-field";

import type { AssetCustomFieldValue } from "@exposurenexus/contracts/model/asset-custom-field";

export function formatAssetCustomFieldValue(field: AssetCustomFieldValue | undefined): string {
  if (!field || field.value === null) {
    return "None";
  }

  if (field.type === AssetCustomFieldType.Select) {
    return field.options.find((option) => option.value === field.value)?.label ?? field.value;
  }

  return String(field.value);
}
