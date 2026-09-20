import { assetIdentifierSchema } from "@exposurenexus/backend/assets";
import { weaknessSchema } from "@exposurenexus/backend/findings";

import type { ObservationAffectedResource } from "@exposurenexus/contracts/model/affected-resource";
import type {
  AssetIdentifier,
  AssetIdentifierInput,
} from "@exposurenexus/contracts/model/asset-identifier";
import type { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import type { Weakness } from "@exposurenexus/contracts/model/weakness";
import type { Logger } from "pino";

export type ObservationCandidate = {
  source: string;
  sourceRecord: string;
  title: string;
  description: string | null;
  remediation: string | null;
  evidence: string | null;
  severity: VulnerabilitySeverity;
  weakness: Weakness;
  affectedResource: ObservationAffectedResource;
  observedAt: Date | null;
  potentialAssetIdentifiers: AssetIdentifier[];
};

export type ObservationCandidateInput = Omit<
  ObservationCandidate,
  "source" | "potentialAssetIdentifiers"
> & {
  potentialAssetIdentifiers: AssetIdentifierInput[];
};

export interface Normalizer {
  normalize(bytes: Uint8Array, logger: Logger): ObservationCandidateInput[];
}

function canonicalizeCandidate(
  source: string,
  candidate: ObservationCandidateInput,
): ObservationCandidate | null {
  const weakness = weaknessSchema.safeParse(candidate.weakness);
  if (!weakness.success) {
    return null;
  }

  const potentialAssetIdentifiers: AssetIdentifier[] = [];
  for (const input of candidate.potentialAssetIdentifiers) {
    const identifier = assetIdentifierSchema.safeParse(input);
    if (!identifier.success) {
      return null;
    }
    potentialAssetIdentifiers.push(identifier.data);
  }

  return {
    ...candidate,
    source,
    weakness: weakness.data,
    potentialAssetIdentifiers,
  };
}

export function normalize(
  source: string,
  bytes: Uint8Array,
  normalizers: ReadonlyMap<string, Normalizer>,
  logger: Logger,
): ObservationCandidate[] {
  const normalizer = normalizers.get(source);
  if (normalizer === undefined) {
    throw new Error("No normalizer is registered for this source.");
  }

  const candidates: ObservationCandidate[] = [];
  for (const candidate of normalizer.normalize(bytes, logger)) {
    const normalized = canonicalizeCandidate(source, candidate);
    if (normalized === null) {
      logger.warn("Skipping observation candidate with unnormalizable identifiers.");
      continue;
    }
    candidates.push(normalized);
  }
  return candidates;
}
