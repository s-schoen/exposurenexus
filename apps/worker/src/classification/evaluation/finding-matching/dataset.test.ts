import { describe, expect, it } from "vitest";

import { applyOverlay, loadDataset } from "./dataset.js";
import { evaluateFindingMatchers } from "./evaluate.js";

import type { FindingMatchResult } from "../../finding-matcher.js";
import type { LabelOverlay } from "./dataset.js";
import type { FindingScenario } from "./evaluate.js";

const abstain = {
  id: "abstain",
  requiresNetwork: false,
  create: () => ({
    match: async (
      _assetId: string,
      candidates: readonly unknown[],
    ): Promise<FindingMatchResult[]> =>
      candidates.map(() => ({
        status: "unresolved",
        reason: "insufficient_evidence",
        explanation: "Always abstains.",
      })),
  }),
};

describe("loadDataset", () => {
  it("combines the edge suite with every frozen snapshot and overlay", async () => {
    const dataset = await loadDataset();

    expect(
      dataset.scenarios.map((scenario) => `${scenario.id}:${scenario.suite ?? "edge"}`),
    ).toEqual([
      "container-packages:edge",
      "source-code:edge",
      "source-drift:edge",
      "replay-fixtures:replay",
      "replay-lab:replay",
      "heldout-replay:heldout",
    ]);
    for (const scenario of dataset.scenarios) {
      expect(scenario.findings.every((finding) => finding.createdAt instanceof Date)).toBe(true);
      expect(
        scenario.observations.every((observation) => observation.observedAt instanceof Date),
      ).toBe(true);
      expect(
        scenario.cases.every((batch) =>
          batch.candidates.every(
            ({ candidate }) =>
              candidate.observedAt === null || candidate.observedAt instanceof Date,
          ),
        ),
      ).toBe(true);
    }
  });

  it("passes evaluator validation and keeps held-out labels opt-in", async () => {
    const dataset = await loadDataset();
    const scenarioIds = async (options?: Parameters<typeof evaluateFindingMatchers>[2]) =>
      (await evaluateFindingMatchers(dataset, [abstain], options)).matchers[0].scenarios.map(
        (scenario) => scenario.id,
      );

    expect(await scenarioIds()).not.toContain("heldout-replay");
    expect(await scenarioIds({ suites: ["heldout"] })).toEqual(["heldout-replay"]);
  });

  it("gives the held-out overlay its base's data with its own labels", async () => {
    const dataset = await loadDataset();
    const base = dataset.scenarios.find((scenario) => scenario.id === "replay-lab")!;
    const heldout = dataset.scenarios.find((scenario) => scenario.id === "heldout-replay")!;
    const withoutLabels = (scenario: FindingScenario) =>
      scenario.cases.map((batch) =>
        batch.candidates.map((entry) => {
          const { expected: _, ...rest } = entry;
          return rest;
        }),
      );

    expect(heldout.findings).toEqual(base.findings);
    expect(heldout.observations).toEqual(base.observations);
    expect(withoutLabels(heldout)).toEqual(withoutLabels(base));
    expect(heldout.cases.map((batch) => batch.note)).not.toEqual(
      base.cases.map((batch) => batch.note),
    );
  });
});

describe("applyOverlay", () => {
  const base = {
    id: "base",
    suite: "replay",
    assets: [],
    findings: [],
    observations: [],
    cases: [
      {
        id: "batch",
        assetId: "asset",
        note: "Base note.",
        candidates: [
          { id: "a", candidate: {}, expected: { status: "new", group: "x" }, tags: ["truth:new"] },
        ],
      },
    ],
  } as unknown as FindingScenario;
  const overlay = (candidates: LabelOverlay["batches"][string]["candidates"]): LabelOverlay => ({
    id: "blind",
    suite: "heldout",
    base: "base",
    batches: { batch: { note: "Blind note.", candidates } },
  });

  it("replaces only expected decisions and notes", () => {
    const result = applyOverlay(
      overlay({ a: { status: "unresolved", reason: "ambiguous" } }),
      base,
    );

    expect(result).toMatchObject({ id: "blind", suite: "heldout" });
    expect(result.cases[0]).toMatchObject({
      note: "Blind note.",
      candidates: [
        { id: "a", expected: { status: "unresolved", reason: "ambiguous" }, tags: ["truth:new"] },
      ],
    });
    expect(base.cases[0].note).toBe("Base note.");
  });

  it.each<[string, LabelOverlay, FindingScenario | undefined]>([
    ["unknown base", overlay({ a: { status: "new", group: "x" } }), undefined],
    ["missing candidate label", overlay({ b: { status: "new", group: "x" } }), base],
    [
      "extra candidate label",
      overlay({ a: { status: "new", group: "x" }, b: { status: "new", group: "x" } }),
      base,
    ],
    ["unknown batch", { ...overlay({}), batches: { other: { note: "n", candidates: {} } } }, base],
  ])("rejects an overlay with an %s", (_case, input, target) => {
    expect(() => applyOverlay(input, target)).toThrow(/Label overlay blind/);
  });
});
