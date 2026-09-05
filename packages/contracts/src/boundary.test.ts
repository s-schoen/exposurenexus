import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url);

describe("contracts package boundary", () => {
  it("remains a leaf package with explicit client-safe export paths", () => {
    const manifest = JSON.parse(readFileSync(new URL("package.json", root), "utf8")) as {
      dependencies: Record<string, string>;
      exports: Record<string, { types: string; import: string }>;
    };
    expect(Object.keys(manifest.dependencies)).toEqual(["zod"]);
    for (const [subpath, entry] of Object.entries(manifest.exports)) {
      expect(subpath).toMatch(/^\.\/(api|model\/[a-z-]+)$/u);
      expect(entry.types).toBe(entry.import.replace(/\.js$/u, ".d.ts"));
      expect(
        existsSync(
          new URL(entry.import.replace("./dist/", "./src/").replace(/\.js$/u, ".ts"), root),
        ),
      ).toBe(true);
    }
  });

  it("imports only its own files and Zod, with no executable business helpers", () => {
    const source = fileURLToPath(new URL("src/", root));
    const files = readdirSync(source, { recursive: true, encoding: "utf8" }).filter(
      (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"),
    );
    for (const name of files) {
      const text = readFileSync(`${source}/${name}`, "utf8");
      const specifiers = [
        ...text.matchAll(/(?:from\s*|import(?:\s+|\s*\(\s*)|require\s*\(\s*)["']([^"']+)["']/gu),
      ].map((match) => match[1]!);
      for (const specifier of specifiers) {
        expect(specifier).toMatch(/^(?:zod\/v4|\.\.?\/)/u);
        if (specifier.startsWith(".")) {
          const target = fileURLToPath(new URL(specifier, new URL(name, new URL("src/", root))));
          expect(target.startsWith(source)).toBe(true);
        }
      }
      expect(text).not.toMatch(
        /export\s+(?:async\s+)?function\s|\.transform\(|\.trim\(|\.toLowerCase\(|\.superRefine\(/u,
      );
      expect(text).not.toMatch(/passwordHash|tokenDigest|sessionDigest|Kysely|ApplicationError/u);
    }
  });
});
