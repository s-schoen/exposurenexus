import type {
  AssetEnvironment,
  AssetLifecycleState,
  AssetType,
} from "@exposurenexus/types/model/asset";
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
