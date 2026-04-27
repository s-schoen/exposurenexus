import { AssetCustomFieldType } from "@openvlp/types/model/asset"
import type { AssetCustomFieldDefinition } from "@openvlp/types/model/asset"

export const ASSET_CUSTOM_FIELD_FIXTURES: Array<AssetCustomFieldDefinition> = [
  {
    id: "8f0365b2-1bbb-46e2-b1f4-06300ade23f3",
    key: "category",
    name: "Category",
    required: false,
    type: AssetCustomFieldType.Text,
    defaultValue: null
  },
  {
    id: "2808e68c-9a48-4b50-9a2d-d1df4c83ff06",
    key: "priority",
    name: "Priority",
    required: true,
    type: AssetCustomFieldType.Number,
    defaultValue: 3
  },
  {
    id: "7f732d2b-8985-4551-b45d-0eaf527a1577",
    key: "environment",
    name: "Environment",
    required: true,
    type: AssetCustomFieldType.Select,
    defaultValue: "production",
    options: [
      {
        id: "6b567696-6808-45be-ab67-a8683d98a138",
        fieldId: "7f732d2b-8985-4551-b45d-0eaf527a1577",
        value: "production",
        label: "Production"
      },
      {
        id: "1dec1f7b-0650-4e64-bdfa-1d4228a99e87",
        fieldId: "7f732d2b-8985-4551-b45d-0eaf527a1577",
        value: "staging",
        label: "Staging"
      }
    ]
  }
]
