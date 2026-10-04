import { assetIdentifierSchema } from "@exposurenexus/backend/assets";
import { AssetIdentifierType } from "@exposurenexus/contracts/model/asset-identifier";

import { splitImageName } from "./identifier-evidence.js";

import type { PartialIdentity } from "./identifier-evidence.js";
import type { AssetIdentifier } from "@exposurenexus/contracts/model/asset-identifier";

/** One canonical inventory identifier and the asset, active or archived, that owns it. */
export type InventoryIdentifier = Pick<AssetIdentifier, "type" | "namespace" | "value"> & {
  assetId: string;
};

/** Log-safe error for inventory data that violates identifier invariants. */
export const invalidInventoryResponse = "Invalid asset inventory response.";

type Entry = { assetId: string; namespace: string | null };
type AwsEntry = Entry & { partition: string; service: string; region: string; account: string };

function identifierKey(type: AssetIdentifierType, namespace: string | null, value: string) {
  return JSON.stringify([type, namespace, value]);
}

function append<T>(map: Map<string, T[]>, key: string, entry: T) {
  const entries = map.get(key);
  if (entries === undefined) {
    map.set(key, [entry]);
  } else {
    entries.push(entry);
  }
}

function inScope(entry: Entry, namespace: string | undefined) {
  return namespace === undefined || entry.namespace === namespace;
}

function assetIds<T extends Entry>(entries: readonly T[] | undefined, keep: (entry: T) => boolean) {
  return new Set((entries ?? []).filter(keep).map((entry) => entry.assetId));
}

/**
 * Read-only lookup structures over one inventory identifier snapshot.
 *
 * @throws An `Error` when a row lacks an asset ID, is not canonical, or repeats an
 * identifier already owned by any asset.
 */
export class IdentifierIndex {
  private readonly exact = new Map<string, string>();
  private readonly byValue = new Map<string, Entry[]>();
  private readonly hostsByLabel = new Map<string, Entry[]>();
  private readonly imagesByPath = new Map<string, Entry[]>();
  private readonly repositoriesByPath = new Map<string, Entry[]>();
  private readonly awsByResource = new Map<string, AwsEntry[]>();

  constructor(identifiers: readonly InventoryIdentifier[]) {
    for (const { assetId, type, namespace, value } of identifiers) {
      const key = identifierKey(type, namespace, value);
      const parsed = assetIdentifierSchema.safeParse({ type, namespace, value });
      if (
        typeof assetId !== "string" ||
        assetId.length === 0 ||
        !parsed.success ||
        identifierKey(parsed.data.type, parsed.data.namespace, parsed.data.value) !== key ||
        this.exact.has(key)
      ) {
        throw new Error(invalidInventoryResponse);
      }

      const entry = { assetId, namespace };
      this.exact.set(key, assetId);
      append(this.byValue, identifierKey(type, null, value), entry);

      switch (type) {
        case AssetIdentifierType.DnsName:
          append(this.hostsByLabel, value.split(".", 1)[0], entry);
          break;
        case AssetIdentifierType.OciImageName:
          append(this.imagesByPath, splitImageName(value).path, entry);
          break;
        case AssetIdentifierType.VcsRepository:
          // Canonical VCS identifiers always start with a slash-free server.
          append(this.repositoriesByPath, value.slice(value.indexOf("/") + 1), entry);
          break;
        case AssetIdentifierType.CloudResourceId: {
          const [prefix, partition, service, region, account, ...resource] = value.split(":");
          if (prefix === "arn" && resource.length > 0) {
            append(this.awsByResource, resource.join(":"), {
              ...entry,
              partition,
              service,
              region,
              account,
            });
          }
          break;
        }
        case AssetIdentifierType.IpAddress:
          break;
      }
    }
  }

  /** The asset owning this identifier in exactly its namespace. */
  public exactAsset(identifier: AssetIdentifier): string | undefined {
    return this.exact.get(identifierKey(identifier.type, identifier.namespace, identifier.value));
  }

  /** Assets plausibly identified by one partial reading. */
  public partialAssets(partial: PartialIdentity): Set<string> {
    switch (partial.kind) {
      case "unscoped":
        return assetIds(
          this.byValue.get(identifierKey(partial.type, null, partial.value)),
          () => true,
        );
      case "hostLabel":
        return assetIds(this.hostsByLabel.get(partial.label), (entry) =>
          inScope(entry, partial.namespace),
        );
      case "imagePath":
        return assetIds(this.imagesByPath.get(partial.path), (entry) =>
          inScope(entry, partial.namespace),
        );
      case "repositoryPath":
        return assetIds(this.repositoriesByPath.get(partial.path), () => true);
      case "awsResource":
        return assetIds(
          this.awsByResource.get(partial.resource),
          (entry) =>
            (entry.partition === "aws" || entry.partition.startsWith("aws-")) &&
            (partial.service === undefined || entry.service === partial.service) &&
            (partial.region === undefined || entry.region === partial.region) &&
            (partial.account === undefined || entry.account === partial.account),
        );
    }
  }
}
