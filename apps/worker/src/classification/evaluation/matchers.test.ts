import { describe, expect, it } from "vitest";

import { matchers } from "./matchers.js";

import type { Asset } from "@exposurenexus/contracts/model/asset";

const inventory: Asset[] = [];

describe("evaluation matchers", () => {
  it("registers every implemented matcher as offline", () => {
    expect(matchers.map((matcher) => matcher.id)).toEqual(["identifier"]);
    expect(matchers.every((matcher) => matcher.requiresNetwork === false)).toBe(true);
  });

  it("creates a usable matcher for each factory", async () => {
    for (const factory of matchers) {
      const matcher = await factory.create(inventory);
      expect(typeof matcher.match).toBe("function");
    }
  });
});
