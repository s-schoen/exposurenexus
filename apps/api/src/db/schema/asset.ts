import type {
  AssetCustomFieldType,
  AssetType
} from "@openvlp/types/model/asset"
import type { Generated } from "kysely"

export type AssetCustomFieldStoredValue = string | number

export interface AssetTable {
  id: Generated<string>
  name: string
  type: AssetType
}

export interface AssetCustomFieldTable {
  id: Generated<string>
  key: string
  name: string
  type: AssetCustomFieldType
  required: Generated<boolean>
  defaultValue: AssetCustomFieldStoredValue | null
}

export interface AssetCustomFieldOptionTable {
  id: Generated<string>
  fieldId: string
  value: string
  label: string
}

export interface AssetCustomFieldValueTable {
  assetId: string
  fieldId: string
  value: AssetCustomFieldStoredValue
}
