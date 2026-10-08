import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import {
  AssetEnvironment,
  AssetIdentifierType,
  AssetLifecycleState,
  AssetType,
} from "@exposurenexus/contracts/model/asset";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { describe, expect, it, vi } from "vitest";

import {
  identifierInventoryFrom,
  identifierInventorySnapshotFrom,
} from "./asset-inventory-adapter.js";
import { IdentifierAssetMatcher } from "./identifier-matcher.js";

import type { ObservationCandidate } from "../classifier.js";
import type { Asset } from "@exposurenexus/contracts/model/asset";
import type { Logger } from "pino";

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

describe("identifierInventorySnapshotFrom", () => {
  const logger = { debug: vi.fn() } as unknown as Logger;

  function candidate(host: string): ObservationCandidate {
    return {
      source: "nuclei",
      sourceRecord: "line:1",
      title: "Example detection",
      description: null,
      remediation: null,
      evidence: null,
      severity: VulnerabilitySeverity.Medium,
      weakness: { identifiers: {} },
      affectedResource: { type: AffectedResourceType.Unspecified },
      observedAt: null,
      assetIdentifierCandidates: [
        { type: AssetIdentifierType.DnsName, namespace: "zone-a", value: host },
      ],
      fingerprints: {},
      sourceMetadata: {},
    };
  }

  it("lists the inventory once across many match calls", async () => {
    const listAll = vi.fn(async () => [asset("portal"), asset("gateway")]);
    const matcher = new IdentifierAssetMatcher(identifierInventorySnapshotFrom({ listAll }));

    const results = await Promise.all(
      ["portal", "gateway", "missing", "portal"].map((id) =>
        matcher.match(candidate(`${id}.example.test`), logger),
      ),
    );

    expect(results).toMatchObject([
      { status: "matched", assetId: "portal" },
      { status: "matched", assetId: "gateway" },
      { status: "unresolved", reason: "no_match" },
      { status: "matched", assetId: "portal" },
    ]);
    expect(listAll).toHaveBeenCalledTimes(1);
    expect(listAll).toHaveBeenCalledWith();
  });

  it("answers asset existence from the same snapshot", async () => {
    const listAll = vi.fn(async () => [
      { ...asset("unidentified"), identifiers: [] },
      asset("archived", AssetLifecycleState.Archived),
    ]);
    const inventory = identifierInventorySnapshotFrom({ listAll });

    expect(await inventory.hasAsset("unidentified")).toBe(true);
    expect(await inventory.hasAsset("archived")).toBe(true);
    expect(await inventory.hasAsset("missing")).toBe(false);
    expect(await inventory.listIdentifiers()).toEqual([
      {
        assetId: "archived",
        type: AssetIdentifierType.DnsName,
        namespace: "zone-a",
        value: "archived.example.test",
      },
    ]);
    expect(listAll).toHaveBeenCalledTimes(1);
  });

  it("rejects a repeated asset ID with a log-safe error", async () => {
    const inventory = identifierInventorySnapshotFrom({
      listAll: async () => [asset("same"), asset("same")],
    });

    await expect(inventory.hasAsset("same")).rejects.toThrow(
      /^Invalid asset inventory response\.$/,
    );
    await expect(inventory.listIdentifiers()).rejects.toThrow(
      /^Invalid asset inventory response\.$/,
    );
  });
});
