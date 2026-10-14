import { AssetEnvironment } from "@exposurenexus/contracts/model/asset";

const assetEnvironmentLabels = {
  [AssetEnvironment.Development]: "Development",
  [AssetEnvironment.Staging]: "Staging",
  [AssetEnvironment.Production]: "Production",
  [AssetEnvironment.Unknown]: "Unknown",
  [AssetEnvironment.NotApplicable]: "Not applicable",
} satisfies Record<AssetEnvironment, string>;

export function formatAssetEnvironment(environment: AssetEnvironment) {
  return assetEnvironmentLabels[environment];
}
