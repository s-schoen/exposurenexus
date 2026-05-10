import type { AssetType } from "@exposurenexus/types/model/asset"
import type { Generated } from "kysely"

export interface AssetTable {
  id: Generated<string>
  name: string
  type: AssetType
  ownerId: string | null
}
