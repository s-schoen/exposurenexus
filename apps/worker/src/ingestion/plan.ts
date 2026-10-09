import { toFindingAffectedResource } from "@exposurenexus/backend/findings";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";

import type { ObservationCandidate } from "../classification/classifier.js";
import type { FindingMatchResult } from "../classification/finding-matcher.js";
import type { IngestionPlan, PlannedObservation } from "@exposurenexus/backend/ingestions";

/** The finding matching decisions for the candidates of one asset, index-aligned. */
export interface MatchedBatch {
  assetId: string;
  candidates: readonly ObservationCandidate[];
  decisions: readonly FindingMatchResult[];
}

const severityOrder: readonly VulnerabilitySeverity[] = [
  VulnerabilitySeverity.Info,
  VulnerabilitySeverity.Low,
  VulnerabilitySeverity.Medium,
  VulnerabilitySeverity.High,
  VulnerabilitySeverity.Critical,
];

function highestSeverity(candidates: readonly ObservationCandidate[]): VulnerabilitySeverity {
  return candidates
    .map(({ severity }) => severity)
    .reduce((highest, severity) =>
      severityOrder.indexOf(severity) > severityOrder.indexOf(highest) ? severity : highest,
    );
}

function append<T>(map: Map<string, T[]>, key: string, value: T) {
  const values = map.get(key);
  if (values) values.push(value);
  else map.set(key, [value]);
}

function plannedObservation(
  candidate: ObservationCandidate,
  ingestionCreatedAt: Date,
): PlannedObservation {
  return {
    title: candidate.title,
    description: candidate.description,
    evidence: candidate.evidence,
    remediation: candidate.remediation,
    severity: candidate.severity,
    weakness: candidate.weakness,
    affectedResource: candidate.affectedResource,
    fingerprints: candidate.fingerprints,
    observedAt: candidate.observedAt ?? ingestionCreatedAt,
  };
}

/**
 * Builds the plan an ingestion records from its finding matching decisions.
 *
 * Each new finding group seeds one finding. Its first candidate in source order supplies the
 * title, weakness and affected resource, without observation-only resource fields, and the
 * group's highest severity becomes the finding's. Matched candidates are attached to their
 * finding, one attachment per finding. Unresolved candidates are left out. Observations
 * without an observed time fall back to the ingestion's creation time.
 */
export function buildIngestionPlan(
  ingestion: { createdAt: Date },
  batches: readonly MatchedBatch[],
): IngestionPlan {
  const plan: IngestionPlan = { newFindings: [], attachments: [] };
  for (const { assetId, candidates, decisions } of batches) {
    // Group keys are batch-local, so groups never span assets.
    const groups = new Map<string, ObservationCandidate[]>();
    const attachments = new Map<string, ObservationCandidate[]>();
    candidates.forEach((candidate, index) => {
      const decision = decisions[index];
      if (decision.status === "new") append(groups, decision.group, candidate);
      else if (decision.status === "matched") append(attachments, decision.findingId, candidate);
    });
    for (const group of groups.values()) {
      const [first] = group;
      plan.newFindings.push({
        assetId,
        finding: {
          title: first.title,
          severity: highestSeverity(group),
          weakness: first.weakness,
          affectedResource: toFindingAffectedResource(first.affectedResource),
        },
        observations: group.map((candidate) => plannedObservation(candidate, ingestion.createdAt)),
      });
    }
    for (const [findingId, attached] of attachments) {
      plan.attachments.push({
        findingId,
        assetId,
        observations: attached.map((candidate) =>
          plannedObservation(candidate, ingestion.createdAt),
        ),
      });
    }
  }
  return plan;
}
