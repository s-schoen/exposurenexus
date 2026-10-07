import { describe, expect, it } from "vitest";

import { loadDataset } from "./dataset.js";
import { evaluateAssetMatchers } from "./evaluate.js";

import type { AssetMatchResult } from "../asset-matcher.js";

const abstain = {
  id: "abstain",
  requiresNetwork: false,
  create: () => ({
    match: async (): Promise<AssetMatchResult> => ({
      status: "unresolved",
      reason: "no_match",
      explanation: "Always abstains.",
    }),
  }),
};

describe("loadDataset", () => {
  it("combines the edge suite with every frozen snapshot", async () => {
    const dataset = await loadDataset();

    expect(
      dataset.scenarios.map((scenario) => `${scenario.id}:${scenario.suite ?? "edge"}`),
    ).toEqual([
      "network:edge",
      "repositories-images:edge",
      "cloud-scoped:edge",
      "generated-medium:generated",
      "generated-small:generated",
      "heldout-generated:heldout",
      "heldout-replay:heldout",
      "replay-fixtures:replay",
      "replay-lab:replay",
    ]);
    for (const scenario of dataset.scenarios) {
      expect(scenario.assets.every((asset) => asset.createdAt instanceof Date)).toBe(true);
      expect(
        scenario.cases.every(
          (entry) =>
            entry.candidate.observedAt === null || entry.candidate.observedAt instanceof Date,
        ),
      ).toBe(true);
    }
  });

  it("passes evaluator validation and keeps held-out snapshots opt-in", async () => {
    const dataset = await loadDataset();
    const scenarioIds = async (suites?: Parameters<typeof evaluateAssetMatchers>[2]) =>
      (await evaluateAssetMatchers(dataset, [abstain], suites)).matchers[0].scenarios.map(
        (scenario) => scenario.id,
      );

    expect(await scenarioIds()).not.toContain("heldout-replay");
    expect(await scenarioIds({ suites: ["heldout"] })).toEqual([
      "heldout-generated",
      "heldout-replay",
    ]);
  });

  it("explains every frozen label with a note", async () => {
    const dataset = await loadDataset();
    const frozen = dataset.scenarios.filter((scenario) => scenario.suite !== undefined);

    expect(
      frozen.flatMap((scenario) => scenario.cases).every((entry) => entry.note !== undefined),
    ).toBe(true);
  });
});
