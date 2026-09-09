import {
  getOrCreateRuntimeValue,
  getRuntimeDatabase,
  getRuntimeLogger,
  type BackendRuntime,
} from "../../runtime.js";
import { getUserProfileByID } from "../identity/users/user-profile-persistence.js";
import * as assetProjection from "./asset-projection.js";
import * as assetCustomFieldPersistence from "./custom-fields/asset-custom-field-persistence.js";
import { createAssetCustomFields } from "./custom-fields/custom-fields.js";
import * as assetInventoryPersistence from "./inventory/asset-inventory-persistence.js";
import { createAssetInventory } from "./inventory/inventory.js";

import type { DatabaseExecutor } from "../../database/executor.js";
import type { AssetCustomFields } from "./custom-fields/commands.js";
import type { AssetInventory } from "./inventory/commands.js";

export interface Assets {
  inventory: AssetInventory;
  customFields: AssetCustomFields;
}

const assetsRuntimeKey = {};

export function createAssets(runtime: BackendRuntime): Assets {
  return getOrCreateRuntimeValue(runtime, assetsRuntimeKey, () => {
    const database = getRuntimeDatabase(runtime);
    const logger = getRuntimeLogger(runtime);
    const userProfileLookup = {
      getByID: (executor: DatabaseExecutor, id: string) => getUserProfileByID(executor, id),
    };
    const customFields = createAssetCustomFields({
      database,
      assetCustomFieldPersistence,
      assetProjection,
      userProfileLookup,
      logger: logger.child({ capability: "assets", component: "custom-fields" }),
    });

    return {
      inventory: createAssetInventory({
        database,
        assetPersistence: assetInventoryPersistence,
        assetProjection,
        userProfileLookup,
        logger: logger.child({ capability: "assets", component: "inventory" }),
      }),
      customFields,
    } satisfies Assets;
  });
}
