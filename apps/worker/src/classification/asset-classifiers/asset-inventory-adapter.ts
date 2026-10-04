import { invalidInventoryResponse } from "./identifier-index.js";

import type { IdentifierInventory, InventoryIdentifier } from "./identifier-matcher.js";
import type { AssetInventory } from "@exposurenexus/backend/assets";

/**
 * Adapts the backend asset inventory for {@link IdentifierAssetMatcher}. Assets are
 * listed without filters, so archived assets stay eligible.
 *
 * @throws An `Error` from `listIdentifiers` when the inventory repeats an asset ID.
 */
export function identifierInventoryFrom(
  inventory: Pick<AssetInventory, "listAll" | "getByID">,
): IdentifierInventory {
  return {
    async listIdentifiers() {
      const assetIds = new Set<string>();
      const identifiers: InventoryIdentifier[] = [];
      for (const asset of await inventory.listAll()) {
        if (assetIds.has(asset.id)) {
          throw new Error(invalidInventoryResponse);
        }
        assetIds.add(asset.id);
        for (const { type, namespace, value } of asset.identifiers) {
          identifiers.push({ assetId: asset.id, type, namespace, value });
        }
      }
      return identifiers;
    },
    async hasAsset(assetId) {
      return (await inventory.getByID(assetId)) !== null;
    },
  };
}
