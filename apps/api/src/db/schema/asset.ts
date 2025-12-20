import type { AssetType } from "@openvlp/types/model/asset"

export interface AssetTable {
  id: string
  name: string
  type: AssetType
}
