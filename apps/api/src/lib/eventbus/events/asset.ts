import type { AssetWithCustomFields } from "@exposurenexus/types/model/asset";

export type AssetEventPayloads = {
  "asset.created": {
    asset: AssetWithCustomFields;
  };
  "asset.updated": {
    previous: AssetWithCustomFields;
    current: AssetWithCustomFields;
  };
  "asset.deleted": {
    asset: AssetWithCustomFields;
  };
};
