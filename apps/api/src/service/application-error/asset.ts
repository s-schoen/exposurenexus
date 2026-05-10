import type { AssetType } from "@exposurenexus/types/model/asset"

export type AssetApplicationErrorCatalog = {
  "asset.list_failed": { kind: "unexpected" }
  "asset.list_with_custom_fields_failed": { kind: "unexpected" }
  "asset.get_failed": { kind: "unexpected"; details: { assetId: string } }
  "asset.get_by_name_failed": {
    kind: "unexpected"
    details: { assetName: string; assetType: AssetType | undefined }
  }
  "asset.owner_unknown": {
    kind: "validation"
    details: { ownerId: string }
  }
  "asset.create_failed": {
    kind: "unexpected"
    details: { assetName: string; assetType: AssetType }
  }
  "asset.owner_update_failed": {
    kind: "unexpected"
    details: { assetId: string }
  }
  "asset.delete_referenced_by_findings": {
    kind: "conflict"
    details: { assetId: string }
  }
  "asset.delete_failed": {
    kind: "unexpected"
    details: { assetId: string }
  }
}
