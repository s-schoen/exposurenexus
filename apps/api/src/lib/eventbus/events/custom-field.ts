import type { AssetCustomFieldDefinition } from "@exposurenexus/types/model/asset"

export type CustomFieldEventPayloads = {
  "custom-field.created": {
    customFieldDefinition: AssetCustomFieldDefinition
  }
  "custom-field.updated": {
    previous: AssetCustomFieldDefinition
    current: AssetCustomFieldDefinition
  }
  "custom-field.deleted": {
    customFieldDefinition: AssetCustomFieldDefinition
  }
}
