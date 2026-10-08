import { invalidInventoryResponse } from "./identifier-index.js";

import type { IdentifierInventory, InventoryIdentifier } from "./identifier-matcher.js";
import type { AssetInventory } from "@exposurenexus/backend/assets";

type InventorySnapshot = { assetIds: ReadonlySet<string>; identifiers: InventoryIdentifier[] };

async function readInventory(
  inventory: Pick<AssetInventory, "listAll">,
): Promise<InventorySnapshot> {
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
  return { assetIds, identifiers };
}

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
      return (await readInventory(inventory)).identifiers;
    },
    async hasAsset(assetId) {
      return (await inventory.getByID(assetId)) !== null;
    },
  };
}

/**
 * Like {@link identifierInventoryFrom}, but reads the inventory once, on first use, and
 * answers every later call from that point-in-time read. Create one per ingestion, so
 * the matcher stays cache-free; the ingestion write rechecks assets that were deleted
 * since.
 *
 * @throws An `Error` from either method when the inventory repeats an asset ID, or when
 * the single read failed.
 */
export function identifierInventorySnapshotFrom(
  inventory: Pick<AssetInventory, "listAll">,
): IdentifierInventory {
  let snapshot: Promise<InventorySnapshot> | undefined;
  const read = () => (snapshot ??= readInventory(inventory));
  return {
    async listIdentifiers() {
      return (await read()).identifiers;
    },
    async hasAsset(assetId) {
      return (await read()).assetIds.has(assetId);
    },
  };
}
