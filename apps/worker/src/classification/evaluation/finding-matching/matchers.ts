import { fingerprintsSchema } from "@exposurenexus/backend/findings";

import { IdentityFindingMatcher } from "../../finding-classifiers/identity-matcher.js";

import type { FindingIdentity } from "../../finding-classifiers/identity-matcher.js";
import type { EvaluationObservation, FindingMatcherFactory, FindingRecord } from "./evaluate.js";

/** Projects fixture findings on one asset, merging their observations' source fingerprints. */
function findingIdentities(
  assetId: string,
  findings: readonly FindingRecord[],
  observations: readonly EvaluationObservation[],
): FindingIdentity[] {
  return findings
    .filter((finding) => finding.assetId === assetId)
    .map(({ id, status, createdAt, weakness, affectedResource }) => {
      const merged: Record<string, string[]> = {};
      for (const observation of observations) {
        if (observation.findingId !== id) {
          continue;
        }
        for (const [namespace, values] of Object.entries(observation.fingerprints)) {
          (merged[namespace] ??= []).push(...values);
        }
      }
      return {
        id,
        assetId,
        status,
        createdAt,
        weakness,
        affectedResource,
        fingerprints: fingerprintsSchema.parse(merged),
      };
    });
}

// Add evaluation-only factories here when concrete matchers exist. Keep setup lazy.
export const matchers: FindingMatcherFactory[] = [
  {
    id: "identity",
    requiresNetwork: false,
    create: ({ findings, observations }) =>
      new IdentityFindingMatcher({
        listFindings: async (assetId) => findingIdentities(assetId, findings, observations),
      }),
  },
];
