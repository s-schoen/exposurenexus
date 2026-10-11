import { AssetType } from "@exposurenexus/contracts/model/asset";

const assetTypeLabels = {
  [AssetType.Host]: "Host",
  [AssetType.Software]: "Software",
  [AssetType.ContainerImage]: "Container image",
  [AssetType.CloudResource]: "Cloud resource",
} satisfies Record<AssetType, string>;

export function formatAssetType(type: AssetType) {
  return assetTypeLabels[type];
}
