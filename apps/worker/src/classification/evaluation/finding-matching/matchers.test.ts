import { describe, expect, it, vi } from "vitest";

import { matchers } from "./matchers.js";
import { dataset } from "./scenarios.js";

import type { Logger } from "pino";

const logger = { debug: vi.fn() } as unknown as Logger;

describe("evaluation matchers", () => {
  it("registers every implemented matcher as offline", () => {
    expect(matchers.map((matcher) => matcher.id)).toEqual(["identity"]);
    expect(matchers.every((matcher) => matcher.requiresNetwork === false)).toBe(true);
  });

  it("creates matchers that reach findings through their observation fingerprints", async () => {
    const scenario = dataset.scenarios.find(({ id }) => id === "source-code");
    if (scenario === undefined) {
      throw new Error("missing source-code scenario");
    }
    const batch = scenario.cases.find(({ id }) => id === "code-moved");
    if (batch === undefined) {
      throw new Error("missing code-moved batch");
    }
    const { assets, findings, observations } = structuredClone(scenario);

    for (const factory of matchers) {
      const matcher = await factory.create({ assets, findings, observations });
      const results = await matcher.match(
        batch.assetId,
        batch.candidates.map((entry) => entry.candidate),
        logger,
      );
      expect(results).toEqual(
        batch.candidates.map((entry) =>
          expect.objectContaining({
            status: "matched",
            findingId: entry.expected.status === "matched" ? entry.expected.findingIds[0] : null,
          }),
        ),
      );
    }
  });
});
