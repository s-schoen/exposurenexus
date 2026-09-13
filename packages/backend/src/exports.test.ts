import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  ObjectStorage,
  ObjectStorageConfiguration,
  ObjectStorageWriteCommand,
} from "@exposurenexus/backend/object-storage";
import type { Readable } from "node:stream";

describe("backend exports", () => {
  it("rejects deep imports of private implementations", () => {
    const require = createRequire(import.meta.url);
    for (const subpath of [
      "exposures",
      "runtime",
      "identity/users",
      "findings/findings",
      "features/findings/index",
      "features/findings/finding-persistence",
      "features/import-sources/import-source-persistence",
      "features/import-sources/import-source-table",
      "import-sources/import-sources",
      "object-storage/object-storage",
      "object-storage/object-storage-error",
      "object-storage/index",
      "features/authentication/session-table",
      "features/identity/users/user-profile-persistence",
      "database/schema/ingestion",
      "dist/index.js",
    ]) {
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
      "./findings",
      "./identity",
      "./import-sources",
      "./object-storage",
      "./statistics",
      "./vulnerabilities",
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

  it("exports only the import-source factory from its feature entrypoint", async () => {
    expect(Object.keys(await import("./features/import-sources/index.js"))).toEqual([
      "createImportSources",
    ]);
  });

  it("exports the object-storage factory and caller types without an SDK operational interface", async () => {
    const entrypoint = await import("./object-storage/index.js");
    expect(Object.keys(entrypoint)).toEqual(["createObjectStorage"]);
    expectTypeOf(entrypoint.createObjectStorage)
      .parameter(0)
      .toEqualTypeOf<ObjectStorageConfiguration>();
    expectTypeOf(entrypoint.createObjectStorage).returns.toEqualTypeOf<ObjectStorage>();
    expectTypeOf<ObjectStorageWriteCommand>().toEqualTypeOf<{
      key: string;
      body: Readable;
      expectedSize: number;
    }>();
    expectTypeOf<ObjectStorage>().toEqualTypeOf<{
      readonly bucket: string;
      write(command: ObjectStorageWriteCommand): Promise<void>;
      read(key: string): Promise<Readable>;
      delete(key: string): Promise<void>;
      close(): void;
    }>();
  });
});
