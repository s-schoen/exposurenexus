import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

describe("backend exports", () => {
  it("rejects deep imports of private implementations", () => {
    const require = createRequire(import.meta.url);
    for (const subpath of ["runtime", "identity/users", "database/schema/auth", "dist/index.js"]) {
      expect(() => require.resolve(`@exposurenexus/backend/${subpath}`)).toThrow(
        expect.objectContaining({ code: "ERR_PACKAGE_PATH_NOT_EXPORTED" }),
      );
    }
  });

  it("exposes only runtime and application errors at the package root", async () => {
    expect(Object.keys(await import("./index.js")).sort()).toEqual([
      "ApplicationError",
      "createBackendRuntime",
      "isApplicationError",
    ]);
  });

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
