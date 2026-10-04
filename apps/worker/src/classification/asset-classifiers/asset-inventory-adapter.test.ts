import {
  AssetEnvironment,
  AssetIdentifierType,
  AssetLifecycleState,
  AssetType,
} from "@exposurenexus/contracts/model/asset";
import { describe, expect, it, vi } from "vitest";

import { identifierInventoryFrom } from "./asset-inventory-adapter.js";

import type { Asset } from "@exposurenexus/contracts/model/asset";

function asset(id: string, lifecycleState = AssetLifecycleState.Active): Asset {
  return {
    id,
    displayName: "Example asset",
    type: AssetType.Host,
    environment: AssetEnvironment.Unknown,
    lifecycleState,
    ownerId: null,
    identifiers: [
      {
        id: `${id}-identifier`,
        type: AssetIdentifierType.DnsName,
        namespace: "zone-a",
        value: `${id}.example.test`,
      },
    ],
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    createdBy: "creator",
    updatedBy: "creator",
  };
}

describe("identifierInventoryFrom", () => {
  it("lists identifiers of all assets without lifecycle filters", async () => {
    const listAll = vi.fn(async () => [
      asset("active"),
      asset("archived", AssetLifecycleState.Archived),
    ]);
    const inventory = identifierInventoryFrom({ listAll, getByID: async () => null });

    expect(await inventory.listIdentifiers()).toEqual([
      {
        assetId: "active",
        type: AssetIdentifierType.DnsName,
        namespace: "zone-a",
        value: "active.example.test",
      },
      {
        assetId: "archived",
        type: AssetIdentifierType.DnsName,
        namespace: "zone-a",
        value: "archived.example.test",
      },
    ]);
    expect(listAll).toHaveBeenCalledWith();
  });

  it("rejects a repeated asset ID with a log-safe error", async () => {
    const inventory = identifierInventoryFrom({
      listAll: async () => [asset("same"), asset("same")],
      getByID: async () => null,
    });

    await expect(inventory.listIdentifiers()).rejects.toThrow(
      /^Invalid asset inventory response\.$/,
    );
  });

  it("checks asset existence by ID", async () => {
    const getByID = vi.fn(async (id: string) => (id === "present" ? asset(id) : null));
    const inventory = identifierInventoryFrom({ listAll: async () => [], getByID });

    expect(await inventory.hasAsset("present")).toBe(true);
    expect(await inventory.hasAsset("missing")).toBe(false);
  });
});
