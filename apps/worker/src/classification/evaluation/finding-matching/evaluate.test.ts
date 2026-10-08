import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import {
  AssetEnvironment,
  AssetIdentifierType,
  AssetLifecycleState,
  AssetType,
} from "@exposurenexus/contracts/model/asset";
import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { describe, expect, it, vi } from "vitest";

import { evaluateFindingMatchers } from "./evaluate.js";
import { dataset as edgeDataset } from "./scenarios.js";

import type { ObservationCandidate } from "../../classifier.js";
import type { FindingMatchResult } from "../../finding-matcher.js";
import type {
  EvaluationObservation,
  ExpectedFindingMatch,
  FindingCandidateCase,
  FindingDataset,
  FindingFixture,
  FindingMatcherFactory,
  FindingRecord,
} from "./evaluate.js";
import type { Asset } from "@exposurenexus/contracts/model/asset";

const author = "00000000-0000-4000-8000-000000000009";
const at = new Date("2026-01-01T00:00:00Z");

function asset(key: number): Asset {
  return {
    id: `00000000-0000-4000-8000-00000000000${key}`,
    displayName: `Image ${key}`,
    type: AssetType.ContainerImage,
    environment: AssetEnvironment.Production,
    lifecycleState: AssetLifecycleState.Active,
    ownerId: null,
    identifiers: [
      {
        id: `00000000-0000-4000-8000-00000000010${key}`,
        type: AssetIdentifierType.OciImageName,
        namespace: null,
        value: `registry.example.test/image-${key}`,
      },
    ],
    createdAt: at,
    updatedAt: at,
    createdBy: author,
    updatedBy: author,
  };
}

const [image, otherImage] = [asset(1), asset(2)];

function finding(key: number, owner = image): FindingRecord {
  return {
    id: `00000000-0000-4000-8000-00000000020${key}`,
    assetId: owner.id,
    title: `Finding ${key}`,
    severity: VulnerabilitySeverity.High,
    status: FindingStatus.Mitigated,
    assigneeId: null,
    dueDate: null,
    mitigation: null,
    weakness: { identifiers: { cve: [`CVE-2026-000${key}`] } },
    affectedResource: { type: AffectedResourceType.Package, name: "openssl" },
    createdAt: at,
    updatedAt: at,
    createdBy: author,
    updatedBy: author,
  };
}

const [first, second, elsewhere] = [finding(1), finding(2), finding(3, otherImage)];

const observation: EvaluationObservation = {
  id: "00000000-0000-4000-8000-000000000301",
  findingId: first.id,
  title: "Finding 1",
  description: null,
  evidence: null,
  remediation: null,
  severity: VulnerabilitySeverity.High,
  weakness: first.weakness,
  affectedResource: { type: AffectedResourceType.Package, name: "openssl", version: "3.0.0" },
  fingerprints: {},
  observedAt: at,
  createdAt: at,
  updatedAt: at,
  createdBy: author,
  updatedBy: author,
  source: "trivy",
  ingestionId: "00000000-0000-4000-8000-000000000401",
};

function candidate(key: number): ObservationCandidate {
  return {
    source: "trivy",
    sourceRecord: `Results[0]/Vulnerabilities[${key}]`,
    title: "Example",
    description: null,
    remediation: null,
    evidence: "private-evidence",
    severity: VulnerabilitySeverity.High,
    weakness: { identifiers: { cve: [`CVE-2026-000${key}`] } },
    affectedResource: { type: AffectedResourceType.Package, name: "openssl" },
    observedAt: null,
    assetIdentifierCandidates: [],
    fingerprints: {},
    sourceMetadata: { private: "private-metadata" },
  };
}

function entry(id: string, expected: ExpectedFindingMatch, key = 1): FindingCandidateCase {
  return { id, candidate: candidate(key), expected };
}

function dataset(candidates: FindingCandidateCase[]): FindingDataset {
  return structuredClone({
    id: "test-data",
    scenarios: [
      {
        id: "images",
        assets: [image, otherImage],
        findings: [first, second, elsewhere],
        observations: [observation],
        cases: [{ id: "batch", assetId: image.id, candidates }],
      },
    ],
  });
}

function replying(...batches: Array<FindingMatchResult[] | Error>): FindingMatcherFactory {
  return {
    id: "example",
    requiresNetwork: false,
    create: () => ({
      match: async () => {
        const batch = batches.shift()!;
        if (batch instanceof Error) throw batch;
        return batch;
      },
    }),
  };
}

const matched = (findingId: string): FindingMatchResult => ({
  status: "matched",
  findingId,
  explanation: "Same identity.",
});
const grouped = (group: string): FindingMatchResult => ({
  status: "new",
  group,
  explanation: "No existing finding.",
});
const unresolved = (
  reason: Extract<FindingMatchResult, { status: "unresolved" }>["reason"],
): FindingMatchResult => ({ status: "unresolved", reason, explanation: "Abstained." });

describe("evaluateFindingMatchers", () => {
  it("scores matches per candidate and flags contract violations", async () => {
    const input = dataset([
      entry("correct", { status: "matched", findingIds: [first.id] }),
      entry("either-target", { status: "matched", findingIds: [first.id, second.id] }),
      entry("other-asset", { status: "matched", findingIds: [first.id] }),
      entry("nonexistent", { status: "new", group: "a" }),
      entry("missed", { status: "matched", findingIds: [first.id] }),
      entry("duplicate", { status: "matched", findingIds: [first.id] }),
      entry("abstained", { status: "unresolved", reason: "ambiguous" }),
      entry("wrong-reason", { status: "unresolved", reason: "ambiguous" }),
    ]);
    const report = await evaluateFindingMatchers(input, [
      replying([
        matched(first.id),
        matched(second.id),
        matched(elsewhere.id),
        matched("00000000-0000-4000-8000-999999999999"),
        unresolved("insufficient_evidence"),
        grouped("x"),
        unresolved("ambiguous"),
        unresolved("conflicting_evidence"),
      ]),
    ]);
    const [scenario] = report.matchers[0].scenarios;

    expect(scenario.cases[0].candidates.map((candidate) => candidate.outcome)).toEqual([
      "correct_match",
      "correct_match",
      "wrong_match",
      "wrong_match",
      "missed_match",
      "unexpected_new",
      "correctly_unresolved",
      "incorrect_unresolved_reason",
    ]);
    expect(scenario).toMatchObject({ assetCount: 2, findingCount: 3, observationCount: 1 });
    expect(report.matchers[0].summary).toMatchObject({
      batches: 1,
      candidates: 8,
      expectedMatches: 5,
      correctMatches: 2,
      wrongMatches: 2,
      missedMatches: 1,
      unexpectedNew: 1,
      otherAssetMatches: 1,
      nonexistentMatches: 1,
      matchPrecision: 0.5,
      matchRecall: 0.4,
      newPrecision: 0,
      newRecall: 0,
      incomplete: false,
      failures: [
        "images/batch/other-asset",
        "images/batch/nonexistent",
        "images/batch/missed",
        "images/batch/duplicate",
        "images/batch/wrong-reason",
      ],
    });
    expect(report.matchers[0].summary.confusion).toEqual({
      matched: { matched: 2, "matched:other": 1, insufficient_evidence: 1, new: 1 },
      new: { "matched:other": 1 },
      ambiguous: { ambiguous: 1, conflicting_evidence: 1 },
    });
    expect(JSON.stringify(report)).not.toContain("private-");
  });

  it("compares new groups as a partition, not by key", async () => {
    const input = dataset([
      entry("a1", { status: "new", group: "a" }),
      entry("a2", { status: "new", group: "a" }),
      entry("b", { status: "new", group: "b" }),
      entry("c1", { status: "new", group: "c" }),
      entry("c2", { status: "new", group: "c" }),
      entry("d", { status: "new", group: "d" }),
      entry("e", { status: "new", group: "e" }),
    ]);
    const report = await evaluateFindingMatchers(input, [
      replying([
        // Same partition under different opaque keys.
        grouped("first"),
        grouped("first"),
        grouped("a"),
        // Split, then merged with d.
        grouped("x"),
        grouped("y"),
        grouped("y"),
        unresolved("insufficient_evidence"),
      ]),
    ]);

    expect(
      report.matchers[0].scenarios[0].cases[0].candidates.map((candidate) => candidate.outcome),
    ).toEqual([
      "correct_new",
      "correct_new",
      "correct_new",
      "wrong_grouping",
      "wrong_grouping",
      "wrong_grouping",
      "missed_new",
    ]);
    expect(report.matchers[0].summary).toMatchObject({
      expectedNew: 7,
      correctNew: 3,
      wrongGroupings: 3,
      missedNew: 1,
      newPrecision: 0.5,
      newRecall: 3 / 7,
    });
    expect(report.matchers[0].summary.confusion).toEqual({
      new: { new: 3, "new:regrouped": 3, insufficient_evidence: 1 },
    });
  });

  it("grades decisions against truth separately from the evidence", async () => {
    const input = dataset([
      {
        ...entry("continued", { status: "matched", findingIds: [first.id] }),
        truthFindingIds: [first.id],
      },
      { ...entry("drifted", { status: "new", group: "a" }), truthFindingIds: [first.id] },
      {
        ...entry("evidence-wrong", { status: "matched", findingIds: [second.id] }),
        truthFindingIds: [first.id],
      },
      { ...entry("truly-new", { status: "new", group: "b" }), truthFindingIds: null },
      entry("unknown", { status: "matched", findingIds: [second.id] }),
    ]);
    const report = await evaluateFindingMatchers(input, [
      replying([
        matched(first.id),
        grouped("x"),
        matched(second.id),
        matched(first.id),
        matched(second.id),
      ]),
    ]);
    const { summary, scenarios } = report.matchers[0];

    expect(
      scenarios[0].cases[0].candidates.map((candidate) => [
        candidate.outcome,
        candidate.truthFindingIds,
      ]),
    ).toEqual([
      ["correct_match", [first.id]],
      ["correct_new", [first.id]],
      ["correct_match", [first.id]],
      ["wrong_match", null],
      ["correct_match", undefined],
    ]);
    expect(summary).toMatchObject({
      continuingDetections: 3,
      continuity: 1 / 3,
      duplicates: 1,
      duplicateRate: 1 / 3,
      misattributed: 2,
      misattributionRate: 2 / 5,
    });
    expect(summary.tags["source:trivy"]).toMatchObject({ duplicates: 1, misattributed: 2 });
  });

  it("fails whole batches on errors, wrong lengths, and invalid shapes", async () => {
    const input = dataset([
      entry("one", { status: "matched", findingIds: [first.id] }),
      entry("two", { status: "new", group: "a" }),
    ]);
    input.scenarios[0].cases.push(
      ...["short", "invalid", "throws"].map((id) => ({
        ...structuredClone(input.scenarios[0].cases[0]),
        id,
      })),
    );
    const report = await evaluateFindingMatchers(input, [
      replying(
        [matched(first.id), grouped("a")],
        [matched(first.id)],
        [matched(first.id), { status: "new", explanation: "private-result" } as never],
        new Error("private-provider-error"),
      ),
    ]);
    const { summary } = report.matchers[0];

    expect(
      report.matchers[0].scenarios[0].cases.map((batch) => [
        batch.error,
        batch.candidates.map((candidate) => candidate.outcome),
      ]),
    ).toEqual([
      [null, ["correct_match", "correct_new"]],
      ["Matcher returned an invalid result.", ["error", "error"]],
      ["Matcher returned an invalid result.", ["error", "error"]],
      ["Matcher call failed.", ["error", "error"]],
    ]);
    expect(summary).toMatchObject({
      errors: 6,
      completedTiming: { count: 1 },
      failedTiming: { count: 3 },
      matchRecall: 0.25,
    });
    expect(JSON.stringify(report)).not.toContain("private-");
  });

  it("passes the batch asset and cloned candidates, and fixtures without labels", async () => {
    const input = dataset([
      entry("one", { status: "matched", findingIds: [first.id] }),
      entry("two", { status: "new", group: "a" }, 2),
    ]);
    const original = structuredClone(input);
    const create = vi.fn((fixture: FindingFixture) => {
      expect(fixture).toEqual({
        assets: [image, otherImage],
        findings: [first, second, elsewhere],
        observations: [observation],
      });
      fixture.findings.length = 0;
      return {
        match: async (assetId: string, candidates: readonly ObservationCandidate[]) => {
          expect(assetId).toBe(image.id);
          expect(candidates).toEqual([candidate(1), candidate(2)]);
          (candidates[0] as ObservationCandidate).title = "Changed by this call";
          return [matched(first.id), grouped("a")];
        },
      };
    });
    const report = await evaluateFindingMatchers(input, [
      { id: "one", requiresNetwork: false, create },
      { id: "two", requiresNetwork: false, create },
    ]);

    expect(create).toHaveBeenCalledTimes(2);
    expect(input).toEqual(original);
    expect(report.matchers.map((matcher) => matcher.summary.correctMatches)).toEqual([1, 1]);
  });

  it.each<[string, (input: FindingDataset) => void]>([
    ["finding on an unknown asset", (input) => (input.scenarios[0].assets = [image])],
    [
      "observation of an unknown finding",
      (input) => (input.scenarios[0].findings = [second, elsewhere]),
    ],
    [
      "manual observation with an ingestion",
      (input) => (input.scenarios[0].observations[0].source = "manual"),
    ],
    [
      "noncanonical finding weakness",
      (input) => {
        input.scenarios[0].findings[0].weakness = { identifiers: { CVE: ["cve-2026-0001"] } };
      },
    ],
    [
      "noncanonical observation fingerprints",
      (input) => (input.scenarios[0].observations[0].fingerprints = { semgrep: ["b", "a"] }),
    ],
    [
      "observation-only field on a finding resource",
      (input) => {
        input.scenarios[0].findings[0].affectedResource = {
          type: AffectedResourceType.Package,
          version: "1.0.0",
        } as FindingRecord["affectedResource"];
      },
    ],
    [
      "expected finding on another asset",
      (input) => {
        input.scenarios[0].cases[0].candidates[0].expected = {
          status: "matched",
          findingIds: [elsewhere.id],
        };
      },
    ],
    [
      "expected nonexistent finding",
      (input) => {
        input.scenarios[0].cases[0].candidates[0].expected = {
          status: "matched",
          findingIds: ["00000000-0000-4000-8000-999999999999"],
        };
      },
    ],
    [
      "no expected finding",
      (input) => {
        input.scenarios[0].cases[0].candidates[0].expected = { status: "matched", findingIds: [] };
      },
    ],
    [
      "blank group label",
      (input) => {
        input.scenarios[0].cases[0].candidates[0].expected = { status: "new", group: " " };
      },
    ],
    [
      "duplicate candidate IDs",
      (input) =>
        input.scenarios[0].cases[0].candidates.push(entry("one", { status: "new", group: "a" })),
    ],
    [
      "truth finding on another asset",
      (input) => (input.scenarios[0].cases[0].candidates[0].truthFindingIds = [elsewhere.id]),
    ],
    [
      "nonexistent truth finding",
      (input) => (input.scenarios[0].cases[0].candidates[0].truthFindingIds = [author]),
    ],
    [
      "empty truth list",
      (input) => (input.scenarios[0].cases[0].candidates[0].truthFindingIds = []),
    ],
    [
      "truth that is neither a list nor null",
      (input) => {
        (
          input.scenarios[0].cases[0].candidates[0] as { truthFindingIds: unknown }
        ).truthFindingIds = first.id;
      },
    ],
    ["empty batch", (input) => (input.scenarios[0].cases[0].candidates = [])],
    ["unknown batch asset", (input) => (input.scenarios[0].cases[0].assetId = author)],
    [
      "noncanonical candidate",
      (input) => {
        input.scenarios[0].cases[0].candidates[0].candidate.fingerprints = { Semgrep: ["a"] };
      },
    ],
  ])("rejects a %s before any factory runs", async (_name, invalidate) => {
    const input = dataset([entry("one", { status: "matched", findingIds: [first.id] })]);
    invalidate(input);
    const create = vi.fn();
    await expect(
      evaluateFindingMatchers(input, [{ id: "example", requiresNetwork: false, create }]),
    ).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
});

describe("finding matching edge suite", () => {
  /** Answers with the labels, mapping each group label to a fresh opaque key. */
  const oracle: FindingMatcherFactory = {
    id: "oracle",
    requiresNetwork: false,
    create: () => ({
      match: async (assetId) => {
        const batch = edgeDataset.scenarios
          .flatMap((scenario) => scenario.cases)
          .find((testCase) => testCase.assetId === assetId && !answered.has(testCase))!;
        answered.add(batch);
        return batch.candidates.map(({ expected }) =>
          expected.status === "matched"
            ? matched(expected.findingIds.at(-1)!)
            : expected.status === "new"
              ? grouped(`key-${expected.group.length}-${expected.group}`)
              : unresolved(expected.reason),
        );
      },
    }),
  };
  const answered = new Set<object>();

  it("validates, and labels are consistent with the contract", async () => {
    const report = await evaluateFindingMatchers(edgeDataset, [oracle]);
    const { summary } = report.matchers[0];

    expect(summary.failures).toEqual([]);
    expect(summary).toMatchObject({ errors: 0, otherAssetMatches: 0, nonexistentMatches: 0 });
    expect(Object.keys(summary.confusion).sort()).toEqual([
      "ambiguous",
      "conflicting_evidence",
      "insufficient_evidence",
      "matched",
      "new",
    ]);
  });

  it("covers the cases the finding matcher contract requires", async () => {
    const report = await evaluateFindingMatchers(edgeDataset, [
      { id: "abstain", requiresNetwork: false, create: () => ({ match: vi.fn() }) },
    ]);
    const tags = Object.keys(report.matchers[0].summary.tags);

    expect(tags).toEqual(
      expect.arrayContaining([
        ...[
          FindingStatus.Mitigated,
          FindingStatus.FalsePositive,
          FindingStatus.RiskAccepted,
          FindingStatus.Inactive,
          FindingStatus.OutOfScope,
          FindingStatus.Duplicate,
        ].map((status) => `status:${status}`),
        "origin:manual",
        "partition:siblings",
        "cross-asset",
        "evidence:title-only",
      ]),
    );
  });
});
