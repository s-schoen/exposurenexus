import { affectedResourceEvidence, identifierEvidence } from "./identifier-evidence.js";
import { IdentifierIndex } from "./identifier-index.js";

import type { AssetMatcher, AssetMatchResult } from "../asset-matcher.js";
import type { ObservationCandidate } from "../classifier.js";
import type { IdentityEvidence, PartialIdentity } from "./identifier-evidence.js";
import type { InventoryIdentifier } from "./identifier-index.js";
import type { Logger } from "pino";

export type { InventoryIdentifier } from "./identifier-index.js";

/** Read-only inventory access for {@link IdentifierAssetMatcher}. */
export interface IdentifierInventory {
  /** Every canonical identifier of every asset, active or archived. */
  listIdentifiers(): Promise<readonly InventoryIdentifier[]>;
  /** Whether the asset currently exists, active or archived. */
  hasAsset(assetId: string): Promise<boolean>;
}

const partialLabels: Record<PartialIdentity["kind"], string> = {
  unscoped: "unscoped identifier",
  hostLabel: "short hostname",
  imagePath: "registry-less image path",
  repositoryPath: "server-less repository path",
  awsResource: "partial AWS resource identity",
};

function unresolved(
  reason: Extract<AssetMatchResult, { status: "unresolved" }>["reason"],
  explanation: string,
): AssetMatchResult {
  return { status: "unresolved", reason, explanation };
}

function intersect(sets: readonly Set<string>[]): Set<string> {
  const [first, ...rest] = sets;
  return new Set([...first].filter((assetId) => rest.every((set) => set.has(assetId))));
}

/**
 * Deterministic matcher over canonical asset identifiers.
 *
 * Explicit candidate identifiers are the evidence when present; otherwise identity is
 * derived from typed affected-resource fields. Exact identifier hits decide first.
 * Partial readings, such as an unscoped value or a registry-less image path, are only
 * consulted when no exact identifier matched. Free text, source metadata, and display
 * names are never evidence.
 *
 * Every call reads and validates the current inventory identifiers, so decisions never
 * rest on an earlier snapshot. Selected assets are still checked before being reported.
 */
export class IdentifierAssetMatcher implements AssetMatcher {
  private readonly inventory: IdentifierInventory;

  constructor(inventory: IdentifierInventory) {
    this.inventory = inventory;
  }

  public async match(candidate: ObservationCandidate, logger: Logger): Promise<AssetMatchResult> {
    const result = await this.decide(candidate);
    logger.debug(result, "asset match decided");
    return result;
  }

  private async decide(candidate: ObservationCandidate): Promise<AssetMatchResult> {
    const explicit = candidate.assetIdentifierCandidates.map(identifierEvidence);
    // Derived identity has no namespace, so it must not compete with explicit identifiers.
    const origin = explicit.length > 0 ? "Explicit identifiers" : "Affected resource identity";
    const evidence =
      explicit.length > 0 ? explicit : affectedResourceEvidence(candidate.affectedResource);

    if (evidence.length === 0) {
      return unresolved(
        "insufficient_evidence",
        "Neither asset identifiers nor the affected resource carry usable identity evidence.",
      );
    }

    const index = new IdentifierIndex(await this.inventory.listIdentifiers());
    const result = resolve(index, evidence, origin);
    if (result.status === "matched" && !(await this.inventory.hasAsset(result.assetId))) {
      return unresolved("no_match", `${origin} selected an asset that no longer exists.`);
    }
    return result;
  }
}

function resolve(
  index: IdentifierIndex,
  evidence: readonly IdentityEvidence[],
  origin: string,
): AssetMatchResult {
  const exact = new Set<string>();
  const exactTypes = new Set<string>();
  for (const { identifier } of evidence) {
    if (identifier === null) {
      continue;
    }
    const assetId = index.exactAsset(identifier);
    if (assetId !== undefined) {
      exactTypes.add(identifier.type);
      exact.add(assetId);
    }
  }

  const types = [...exactTypes].join(", ");
  if (exact.size > 1) {
    return unresolved(
      "conflicting_identifiers",
      `${origin} matched ${exact.size} different assets exactly (${types}).`,
    );
  }
  if (exact.size === 1) {
    const [assetId] = exact;
    return {
      status: "matched",
      assetId,
      explanation: `${origin} matched one asset exactly (${types}).`,
    };
  }

  // Each evidence item narrows the plausible assets; items without hits do not veto.
  const plausible: Set<string>[] = [];
  const kinds = new Set<string>();
  for (const { partials } of evidence) {
    const assets = new Set<string>();
    for (const partial of partials) {
      const hits = index.partialAssets(partial);
      if (hits.size > 0) {
        kinds.add(partialLabels[partial.kind]);
        hits.forEach((assetId) => assets.add(assetId));
      }
    }
    if (assets.size > 0) {
      plausible.push(assets);
    }
  }

  if (plausible.length === 0) {
    return unresolved("no_match", `${origin} matched no inventory asset.`);
  }

  const remaining = intersect(plausible);
  const prefix = `${origin} matched no asset exactly; partial identity (${[...kinds].join(", ")})`;
  if (remaining.size === 0) {
    return unresolved("conflicting_identifiers", `${prefix} points to different assets.`);
  }
  if (remaining.size > 1) {
    return unresolved("ambiguous", `${prefix} fits ${remaining.size} assets.`);
  }
  const [assetId] = remaining;
  return { status: "matched", assetId, explanation: `${prefix} fits one asset.` };
}
