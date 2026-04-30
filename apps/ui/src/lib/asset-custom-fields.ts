import { AssetCustomFieldType } from "@openvlp/types/model/asset"
import type { AssetCustomFieldValue } from "@openvlp/types/model/asset"

export function formatAssetCustomFieldValue(
  field: AssetCustomFieldValue | undefined
): string {
  if (!field || field.value === null) {
    return "None"
  }

  if (field.type === AssetCustomFieldType.Select) {
    return (
      field.options.find((option) => option.value === field.value)?.label ??
      field.value
    )
  }

  return String(field.value)
}
