import { AssetCustomFieldType } from "@exposurenexus/contracts/model/asset-custom-field";

const customFieldTypeLabels = {
  [AssetCustomFieldType.Text]: "Text",
  [AssetCustomFieldType.Number]: "Number",
  [AssetCustomFieldType.Select]: "Select",
} satisfies Record<AssetCustomFieldType, string>;

export function formatCustomFieldType(type: AssetCustomFieldType): string {
  return customFieldTypeLabels[type];
}
