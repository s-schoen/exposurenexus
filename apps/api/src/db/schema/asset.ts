import type {
  AssetIdentifierRecord,
  AssetEnvironment,
  AssetLifecycleState,
  AssetType,
} from "@exposurenexus/contracts/model/asset";
import type { Generated } from "kysely";

export interface AssetTable {
  id: Generated<string>;
  displayName: string;
  type: AssetType;
  environment: AssetEnvironment;
  lifecycleState: AssetLifecycleState;
  ownerId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}

export interface AssetIdentifierTable {
  id: Generated<string>;
  assetId: string;
  type: AssetIdentifierRecord["type"];
  namespace: string | null;
  value: string;
}
