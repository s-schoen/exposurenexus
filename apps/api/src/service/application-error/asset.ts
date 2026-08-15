import type { AssetType } from "@exposurenexus/types/model/asset";

export type AssetApplicationErrorCatalog = {
  "asset.list_failed": { kind: "unexpected" };
  "asset.list_with_custom_fields_failed": { kind: "unexpected" };
  "asset.get_failed": { kind: "unexpected"; details: { assetId: string } };
  "asset.get_by_name_failed": {
    kind: "unexpected";
    details: { assetDisplayName: string; assetType: AssetType | undefined };
  };
  "asset.owner_unknown": {
    kind: "validation";
    details: { ownerId: string };
  };
  "asset.display_name_invalid": {
    kind: "validation";
    details: { displayName: string };
  };
  "asset.create_failed": {
    kind: "unexpected";
    details: { assetDisplayName: string; assetType: AssetType };
  };
  "asset.update_empty": { kind: "validation" };
  "asset.update_failed": {
    kind: "unexpected";
    details: { assetId: string };
  };
  "asset.delete_referenced_by_findings": {
    kind: "conflict";
    details: { assetId: string };
  };
  "asset.delete_failed": {
    kind: "unexpected";
    details: { assetId: string };
  };
};
