import { performance } from "node:perf_hooks";

import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import {
  AssetEnvironment,
  AssetIdentifierType,
  AssetLifecycleState,
  AssetType,
} from "@exposurenexus/contracts/model/asset";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { afterEach, describe, expect, it, vi } from "vitest";

import { evaluateAssetMatchers } from "./evaluate.js";

import type { AssetMatchResult } from "../asset-matcher.js";
import type { EvaluationCase, EvaluationDataset, ExpectedAssetMatch } from "./evaluate.js";
import type { Asset } from "@exposurenexus/contracts/model/asset";

const assetId = "00000000-0000-4000-8000-000000000001";
const otherAssetId = "00000000-0000-4000-8000-000000000002";
const asset: Asset = {
  id: assetId,
  displayName: "Example service",
  type: AssetType.Host,
  environment: AssetEnvironment.Production,
  lifecycleState: AssetLifecycleState.Active,
  ownerId: null,
  identifiers: [
    {
      id: "00000000-0000-4000-8000-000000000003",
      type: AssetIdentifierType.DnsName,
      namespace: null,
      value: "example.test",
    },
  ],
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  createdBy: "00000000-0000-4000-8000-000000000004",
  updatedBy: "00000000-0000-4000-8000-000000000004",
};

function testCase(id: string, expected: ExpectedAssetMatch): EvaluationCase {
  return {
    id,
    expected,
    candidate: {
      source: "nuclei",
      sourceRecord: "line:1",
      title: "Example finding",
      description: null,
      remediation: null,
      evidence: "private-evidence",
      severity: VulnerabilitySeverity.High,
      weakness: { identifiers: {} },
      affectedResource: { type: AffectedResourceType.Unspecified },
      observedAt: null,
      assetIdentifierCandidates: [],
      sourceMetadata: { private: "private-metadata" },
    },
  };
}

function dataset(cases: EvaluationCase[]): EvaluationDataset {
  return {
    id: "test-data",
    scenarios: [{ id: "network", assets: [structuredClone(asset)], cases }],
  };
}

describe("evaluateAssetMatchers", () => {
  afterEach(() => vi.restoreAllMocks());

  it("compares assignments against labels without rewarding incorrect assignments", async () => {
    const input = dataset([
      testCase("correct", { status: "matched", assetId }),
      testCase("wrong-target", { status: "matched", assetId }),
      testCase("unexpected-assignment", { status: "unresolved", reason: "insufficient_evidence" }),
      testCase("correct-abstention", { status: "unresolved", reason: "no_match" }),
    ]);
    const decisions: AssetMatchResult[] = [
      { status: "matched", assetId, explanation: "Existing identifier." },
      { status: "matched", assetId: otherAssetId, explanation: "Wrong target." },
      { status: "matched", assetId: otherAssetId, explanation: "Unsupported inference." },
      { status: "unresolved", reason: "no_match", explanation: "No inventory target." },
    ];
    const match = vi.fn(async () => decisions.shift()!);
    const report = await evaluateAssetMatchers(input, [
      { id: "example", requiresNetwork: false, create: () => ({ match }) },
    ]);

    expect(report.matchers[0].summary).toMatchObject({
      cases: 4,
      expectedMatches: 2,
      correctAssignments: 1,
      wrongAssignments: 2,
      missedMatches: 0,
      correctlyUnresolved: 1,
      incorrectUnresolvedReasons: 0,
      errors: 0,
      notRun: 0,
      assignmentPrecision: 1 / 3,
      matchRecall: 1 / 2,
      incomplete: false,
    });
    expect(report.matchers[0].scenarios[0].cases.map((entry) => entry.outcome)).toEqual([
      "correct_assignment",
      "wrong_assignment",
      "wrong_assignment",
      "correctly_unresolved",
    ]);
    expect(match).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(report)).not.toContain("private-evidence");
    expect(JSON.stringify(report)).not.toContain("private-metadata");
  });

  it("keeps failures in recall, continues after setup errors, and separates failed timings", async () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const input = dataset([
      testCase("missed", { status: "matched", assetId }),
      testCase("wrong-reason", { status: "unresolved", reason: "no_match" }),
      testCase("throws", { status: "matched", assetId }),
      testCase("correct", { status: "matched", assetId }),
    ]);
    input.scenarios.push(
      {
        id: "unavailable",
        assets: [structuredClone(asset)],
        cases: [testCase("not-run", { status: "matched", assetId })],
      },
      {
        id: "last",
        assets: [structuredClone(asset)],
        cases: [testCase("no-target", { status: "unresolved", reason: "no_match" })],
      },
    );
    const decisions: Array<AssetMatchResult | Error> = [
      {
        status: "unresolved",
        reason: "insufficient_evidence",
        explanation: "Not enough evidence.",
      },
      { status: "unresolved", reason: "insufficient_evidence", explanation: "Wrong reason." },
      new Error("private-provider-response"),
      { status: "matched", assetId, explanation: "Existing asset." },
      { status: "unresolved", reason: "no_match", explanation: "No target." },
    ];
    const durations = [1, 2, 4, 8, 16];
    const setups = [2, 3, 5];
    const match = vi.fn(async () => {
      now += durations.shift()!;
      const decision = decisions.shift()!;
      if (decision instanceof Error) throw decision;
      return decision;
    });
    const create = vi.fn(async () => {
      const duration = setups.shift()!;
      now += duration;
      if (duration === 3) throw new Error("private-setup-credentials");
      return { match };
    });
    const report = await evaluateAssetMatchers(input, [
      { id: "example", requiresNetwork: false, create },
    ]);

    expect(report.matchers[0].summary).toEqual({
      cases: 6,
      expectedMatches: 4,
      correctAssignments: 1,
      wrongAssignments: 0,
      missedMatches: 1,
      correctlyUnresolved: 1,
      incorrectUnresolvedReasons: 1,
      errors: 1,
      notRun: 1,
      assignmentPrecision: 1,
      matchRecall: 0.25,
      incomplete: true,
      setupFailures: 1,
      setupTiming: { count: 3, totalMs: 10, medianMs: 3, p95Ms: 5 },
      completedTiming: { count: 4, totalMs: 27, medianMs: 5, p95Ms: 16 },
      failedTiming: { count: 1, totalMs: 4, medianMs: 4, p95Ms: 4 },
    });
    expect(report.matchers[0].scenarios[1].cases[0]).toMatchObject({
      outcome: "not_run",
      actual: null,
      durationMs: null,
    });
    expect(create).toHaveBeenCalledTimes(3);
    expect(match).toHaveBeenCalledTimes(5);
    expect(JSON.stringify(report)).not.toContain("private-provider-response");
    expect(JSON.stringify(report)).not.toContain("private-setup-credentials");
  });

  it("selects offline matchers by default and requires explicit live selection plus permission", async () => {
    const input = dataset([testCase("no-target", { status: "unresolved", reason: "no_match" })]);
    const match = async (): Promise<AssetMatchResult> => ({
      status: "unresolved",
      reason: "no_match",
      explanation: "No target.",
    });
    const offline = { id: "offline", requiresNetwork: false, create: vi.fn(() => ({ match })) };
    const live = { id: "live", requiresNetwork: true, create: vi.fn(() => ({ match })) };
    const factories = [offline, live];

    const defaultRun = await evaluateAssetMatchers(input, factories, { allowNetwork: true });
    expect(defaultRun.matchers.map((matcher) => matcher.id)).toEqual(["offline"]);
    expect(defaultRun.matchers[0].summary).toMatchObject({
      assignmentPrecision: null,
      matchRecall: null,
    });
    expect(live.create).not.toHaveBeenCalled();
    await expect(
      evaluateAssetMatchers(input, factories, { matcherIds: ["offline", "live"] }),
    ).rejects.toThrow(/network/i);
    expect(offline.create).toHaveBeenCalledOnce();
    await expect(
      evaluateAssetMatchers(input, factories, { matcherIds: ["unknown"] }),
    ).rejects.toThrow(/unknown matcher/i);
    await expect(
      evaluateAssetMatchers(input, factories, { scenarioIds: ["unknown"] }),
    ).rejects.toThrow(/unknown scenario/i);
    await expect(evaluateAssetMatchers(input, [])).rejects.toThrow(/no offline matchers/i);

    const liveRun = await evaluateAssetMatchers(input, factories, {
      matcherIds: ["live", "live"],
      scenarioIds: ["network"],
      allowNetwork: true,
    });
    expect(liveRun.matchers.map((matcher) => matcher.id)).toEqual(["live"]);
    expect(live.create).toHaveBeenCalledOnce();
  });

  it.each<[string, (input: EvaluationDataset) => void]>([
    [
      "noncanonical weakness",
      (input) => {
        input.scenarios[0].cases[0].candidate.weakness = { identifiers: { CWE: ["79"] } };
      },
    ],
    [
      "invalid observed time",
      (input) => {
        input.scenarios[0].cases[0].candidate.observedAt = new Date(Number.NaN);
      },
    ],
    [
      "malformed affected resource",
      (input) => {
        input.scenarios[0].cases[0].candidate.affectedResource = {
          type: AffectedResourceType.WebEndpoint,
          port: "443" as unknown as number,
        };
      },
    ],
    [
      "unserializable metadata",
      (input) => {
        input.scenarios[0].cases[0].candidate.sourceMetadata = { counter: 1n };
      },
    ],
    [
      "cyclic metadata",
      (input) => {
        const metadata: Record<string, unknown> = {};
        metadata.self = metadata;
        input.scenarios[0].cases[0].candidate.sourceMetadata = metadata;
      },
    ],
    [
      "missing case ID",
      (input) => {
        input.scenarios[0].cases[0].id = undefined as unknown as string;
      },
    ],
    ["duplicate case IDs", (input) => input.scenarios[0].cases.push(input.scenarios[0].cases[0])],
    ["duplicate assets", (input) => input.scenarios[0].assets.push(structuredClone(asset))],
    [
      "missing expected asset",
      (input) => {
        input.scenarios[0].cases[0].expected = { status: "matched", assetId: otherAssetId };
      },
    ],
    [
      "noncanonical inventory",
      (input) => {
        input.scenarios[0].assets[0].identifiers[0].value = "EXAMPLE.TEST.";
      },
    ],
    [
      "noncanonical candidate",
      (input) => {
        input.scenarios[0].cases[0].candidate.assetIdentifierCandidates = [
          { type: AssetIdentifierType.DnsName, namespace: null, value: "EXAMPLE.TEST." },
        ];
      },
    ],
    [
      "conflicting inventory identifiers",
      (input) => {
        const other = structuredClone(asset);
        other.id = otherAssetId;
        other.identifiers[0].id = "00000000-0000-4000-8000-000000000005";
        input.scenarios[0].assets.push(other);
      },
    ],
    [
      "duplicate identifier record IDs",
      (input) => {
        const other = structuredClone(asset);
        other.id = otherAssetId;
        other.identifiers[0].value = "other.example.test";
        input.scenarios[0].assets.push(other);
      },
    ],
    [
      "invalid asset shape",
      (input) => {
        input.scenarios[0].assets[0].id = "not-a-uuid";
      },
    ],
    [
      "empty scenario",
      (input) => {
        input.scenarios[0].cases = [];
      },
    ],
  ])("rejects %s before any factory runs", async (_name, invalidate) => {
    const input = dataset([testCase("target", { status: "matched", assetId })]);
    invalidate(input);
    const create = vi.fn(() => ({
      match: async (): Promise<AssetMatchResult> => ({
        status: "matched",
        assetId,
        explanation: "Target.",
      }),
    }));
    await expect(
      evaluateAssetMatchers(input, [{ id: "example", requiresNetwork: false, create }]),
    ).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });

  it("records malformed results as errors and only retains declared result fields", async () => {
    const input = dataset([testCase("target", { status: "matched", assetId })]);
    const report = await evaluateAssetMatchers(input, [
      {
        id: "invalid",
        requiresNetwork: false,
        create: () => ({
          match: async () =>
            ({ status: "unresolved", reason: "private-result" }) as unknown as AssetMatchResult,
        }),
      },
      {
        id: "valid",
        requiresNetwork: false,
        create: () => ({
          match: async () => ({
            status: "matched" as const,
            assetId,
            explanation: "Existing asset.",
            debug: "private-debug-payload",
          }),
        }),
      },
    ]);
    expect(report.matchers[0].summary).toMatchObject({
      errors: 1,
      matchRecall: 0,
      assignmentPrecision: null,
    });
    expect(report.matchers[1].summary.correctAssignments).toBe(1);
    expect(JSON.stringify(report)).not.toContain("private-result");
    expect(JSON.stringify(report)).not.toContain("private-debug-payload");
  });

  it("isolates fixtures between calls and matchers while sharing an instance within a scenario", async () => {
    const input = dataset([
      testCase("first", { status: "matched", assetId }),
      testCase("second", { status: "matched", assetId }),
    ]);
    input.scenarios.push({ ...structuredClone(input.scenarios[0]), id: "other" });
    const original = structuredClone(input);
    const events: string[] = [];
    const factories = ["one", "two"].map((id) => ({
      id,
      requiresNetwork: false,
      create: (assets: readonly Asset[]) => {
        events.push(`${id}:setup`);
        expect(assets).toEqual(original.scenarios[0].assets);
        assets[0].displayName = "Changed in this instance";
        let calls = 0;
        return {
          match: async (candidate: EvaluationCase["candidate"]): Promise<AssetMatchResult> => {
            calls += 1;
            events.push(`${id}:${calls}`);
            expect(candidate.sourceMetadata).toEqual({ private: "private-metadata" });
            expect(candidate).not.toHaveProperty("expected");
            candidate.sourceMetadata.private = "Changed by this call";
            await Promise.resolve();
            return { status: "matched", assetId, explanation: "Existing asset." };
          },
        };
      },
    }));
    const report = await evaluateAssetMatchers(input, factories);
    expect(events).toEqual([
      "one:setup",
      "one:1",
      "one:2",
      "one:setup",
      "one:1",
      "one:2",
      "two:setup",
      "two:1",
      "two:2",
      "two:setup",
      "two:1",
      "two:2",
    ]);
    expect(input).toEqual(original);
    expect(report.matchers.map((matcher) => matcher.summary.correctAssignments)).toEqual([4, 4]);
    const selected = await evaluateAssetMatchers(input, [factories[0]], {
      scenarioIds: ["network"],
    });
    expect(selected.matchers[0].scenarios).toHaveLength(1);
    expect(selected.dataset.sha256).toBe(report.dataset.sha256);
  });
});
