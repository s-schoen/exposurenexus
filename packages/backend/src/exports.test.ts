import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("backend exports", () => {
  it("keeps rule implementations private and does not re-export contracts wholesale", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as {
      exports: Record<string, { import: string }>;
    };
    expect(Object.keys(manifest.exports).sort()).toEqual([
      ".",
      "./assets",
      "./authentication",
      "./database",
      "./exposures",
      "./identity",
    ]);
    for (const entry of Object.values(manifest.exports)) {
      const source = new URL(
        entry.import.replace("./dist/", "./").replace(/\.js$/u, ".ts"),
        import.meta.url,
      );
      expect(readFileSync(source, "utf8")).not.toMatch(
        /export\s+\*\s+(?:as\s+\w+\s+)?from\s+["']@exposurenexus\/contracts/u,
      );
    }
  });
});
