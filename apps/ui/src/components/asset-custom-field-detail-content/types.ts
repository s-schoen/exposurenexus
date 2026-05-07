import type { AssetCustomFieldDefinition } from "@exposurenexus/types/model/asset"
import type { CustomFieldUpdateResult } from "@/components/asset-custom-field-detail-content/helpers.ts"

export type CustomFieldUpdateHandler = (
  field: AssetCustomFieldDefinition
) => void | Promise<void>

export type CustomFieldUpdateResultHandler = (
  result: CustomFieldUpdateResult
) => void
