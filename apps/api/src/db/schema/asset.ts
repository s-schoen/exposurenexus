import type { AssetType } from "@openvlp/types/model/asset"
import type { Generated } from "kysely"

export interface AssetTable {
  id: Generated<string>
  name: string
  type: AssetType
}
