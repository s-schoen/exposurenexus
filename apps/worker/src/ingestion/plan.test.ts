import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { describe, expect, it } from "vitest";

import { buildIngestionPlan } from "./plan.js";

import type { ObservationCandidate } from "../classification/classifier.js";
import type { FindingMatchResult } from "../classification/finding-matcher.js";

const createdAt = new Date("2026-10-08T12:00:00.000Z");
const assetA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const assetB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const findingId = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function candidate(
  sourceRecord: string,
  fields: Partial<ObservationCandidate> = {},
): ObservationCandidate {
  return {
    source: "trivy",
    sourceRecord,
    title: `Detection ${sourceRecord}`,
    description: `Description ${sourceRecord}`,
    remediation: "Upgrade",
    evidence: "lodash@4.0.0",
    severity: VulnerabilitySeverity.Medium,
    weakness: { identifiers: { cve: ["CVE-2026-0001"] } },
    affectedResource: {
      type: AffectedResourceType.Package,
      ecosystem: "npm",
      name: "lodash",
      version: "4.0.0",
    },
    observedAt: new Date("2026-10-07T08:00:00.000Z"),
    assetIdentifierCandidates: [],
    fingerprints: { trivy: [`fingerprint-${sourceRecord}`] },
    sourceMetadata: { raw: sourceRecord },
    ...fields,
  };
}

const isNew = (group: string): FindingMatchResult => ({
  status: "new",
  group,
  explanation: "No existing finding shares this identity.",
});
const matched = (id: string): FindingMatchResult => ({
  status: "matched",
  findingId: id,
  explanation: "The source fingerprint matches.",
});
const unresolved: FindingMatchResult = {
  status: "unresolved",
  reason: "ambiguous",
  explanation: "Two findings are equally plausible.",
};

describe("buildIngestionPlan", () => {
  it("maps candidates to observations, falling back to the ingestion's creation time", () => {
    const observed = candidate("results[0]");
    const unobserved = candidate("results[1]", { observedAt: null });

    const plan = buildIngestionPlan({ createdAt }, [
      {
        assetId: assetA,
        candidates: [observed, unobserved],
        decisions: [matched(findingId), matched(findingId)],
      },
    ]);

    expect(plan).toEqual({
      newFindings: [],
      attachments: [
        {
          findingId,
          assetId: assetA,
          observations: [
            {
              title: observed.title,
              description: observed.description,
              evidence: observed.evidence,
              remediation: observed.remediation,
              severity: observed.severity,
              weakness: observed.weakness,
              affectedResource: observed.affectedResource,
              fingerprints: observed.fingerprints,
              observedAt: observed.observedAt,
            },
            expect.objectContaining({ title: unobserved.title, observedAt: createdAt }),
          ],
        },
      ],
    });
  });

  it("seeds each new finding from its group's first candidate and highest severity", () => {
    const first = candidate("results[0]", {
      title: "First title",
      severity: VulnerabilitySeverity.Low,
      weakness: { identifiers: { cve: ["CVE-2026-0001"], cwe: ["CWE-79"] } },
    });
    const highest = candidate("results[1]", {
      title: "Later title",
      severity: VulnerabilitySeverity.Critical,
      weakness: { identifiers: { cve: ["CVE-2026-0002"] } },
      affectedResource: { type: AffectedResourceType.Package, name: "other", version: "1.0.0" },
    });
    const last = candidate("results[2]", { severity: VulnerabilitySeverity.High });

    const plan = buildIngestionPlan({ createdAt }, [
      {
        assetId: assetA,
        candidates: [first, highest, last],
        decisions: [isNew("g"), isNew("g"), isNew("g")],
      },
    ]);

    expect(plan.newFindings).toHaveLength(1);
    expect(plan.newFindings[0].assetId).toBe(assetA);
    expect(plan.newFindings[0].finding).toEqual({
      title: "First title",
      severity: VulnerabilitySeverity.Critical,
      weakness: first.weakness,
      affectedResource: { type: AffectedResourceType.Package, ecosystem: "npm", name: "lodash" },
    });
    expect(plan.newFindings[0].observations.map(({ title }) => title)).toEqual([
      "First title",
      "Later title",
      last.title,
    ]);
    // Observations keep their own source snapshot fields.
    expect(plan.newFindings[0].observations[0].affectedResource).toEqual(first.affectedResource);
  });

  it("groups by key within one asset in order of first appearance", () => {
    const plan = buildIngestionPlan({ createdAt }, [
      {
        assetId: assetA,
        candidates: [candidate("a0"), candidate("a1"), candidate("a2"), candidate("a3")],
        decisions: [isNew("x"), isNew("y"), isNew("x"), matched(findingId)],
      },
      {
        // Group keys are batch-local: the same key on another asset is another finding.
        assetId: assetB,
        candidates: [candidate("b0")],
        decisions: [isNew("x")],
      },
    ]);

    expect(
      plan.newFindings.map(({ assetId, observations }) => [
        assetId,
        observations.map(({ title }) => title),
      ]),
    ).toEqual([
      [assetA, ["Detection a0", "Detection a2"]],
      [assetA, ["Detection a1"]],
      [assetB, ["Detection b0"]],
    ]);
    expect(plan.attachments).toEqual([
      {
        findingId,
        assetId: assetA,
        observations: [expect.objectContaining({ title: "Detection a3" })],
      },
    ]);
  });

  it("leaves unresolved candidates out", () => {
    expect(
      buildIngestionPlan({ createdAt }, [
        { assetId: assetA, candidates: [candidate("a0")], decisions: [unresolved] },
      ]),
    ).toEqual({ newFindings: [], attachments: [] });
    expect(buildIngestionPlan({ createdAt }, [])).toEqual({ newFindings: [], attachments: [] });
  });
});
