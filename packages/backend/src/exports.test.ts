import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { describe, expect, expectTypeOf, it } from "vitest";

import type { ApplicationError, BackendRuntime } from "@exposurenexus/backend";
import type {
  createImportSources,
  CreateImportSourceCommand,
  ImportSource,
  ImportSources,
  ImportSourcesConfiguration,
  RegisterImportSourceCommand,
  UploadImportSourceCommand,
} from "@exposurenexus/backend/import-sources";
import type { createIngestions, Ingestions } from "@exposurenexus/backend/ingestions";
import type {
  ObjectStorage,
  ObjectStorageConfiguration,
  ObjectStorageWriteCommand,
} from "@exposurenexus/backend/object-storage";
import type {
  RegisterImportSource,
  SubmitImportSourceDataReply,
} from "@exposurenexus/contracts/api";
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
      "ingestion",
      "ingestions/ingestions",
      "features/ingestions/index",
      "features/ingestions/ingestion-error",
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
      "./ingestions",
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

  it("exports the injected import-source factory and caller types without storage references or lifecycle", async () => {
    expect(Object.keys(await import("./features/import-sources/index.js"))).toEqual([
      "createImportSources",
    ]);
    expectTypeOf<typeof createImportSources>().toEqualTypeOf<
      (
        runtime: BackendRuntime,
        storage: ObjectStorage,
        configuration?: ImportSourcesConfiguration,
      ) => ImportSources
    >();
    expectTypeOf<ImportSourcesConfiguration>().toEqualTypeOf<{
      maxSizeBytes?: number;
      retentionPolicy?: "temporary" | "keep";
    }>();
    expectTypeOf<CreateImportSourceCommand>().toEqualTypeOf<{
      body: Readable;
      sizeBytes: number;
      originalFilename: string;
      mimeType?: string;
      performedBy: string;
    }>();
    expectTypeOf<
      Omit<RegisterImportSourceCommand, "performedBy">
    >().toEqualTypeOf<RegisterImportSource>();
    expectTypeOf<RegisterImportSourceCommand["performedBy"]>().toEqualTypeOf<string>();
    expectTypeOf<UploadImportSourceCommand>().toEqualTypeOf<{
      importSourceId: string;
      performedBy: string;
      body: Readable;
      contentLength?: number;
      signal: AbortSignal;
    }>();
    expectTypeOf<ImportSource>().toEqualTypeOf<{
      id: string;
      ingestionId: string | null;
      source: string | null;
      createdBy: string;
      originalFilename: string;
      mimeType: string | null;
      sizeBytes: number;
      retentionPolicy: "temporary" | "keep";
      state: "incomplete" | "available" | "deleted";
      createdAt: Date;
      uploadStartedAt: Date | null;
      availableAt: Date | null;
      failedAt: Date | null;
      deletedAt: Date | null;
      cleanupRequired: boolean;
    }>();
    expectTypeOf<ImportSources>().toEqualTypeOf<{
      register(command: RegisterImportSourceCommand): Promise<ImportSource>;
      upload(command: UploadImportSourceCommand): Promise<ImportSource>;
      create(command: CreateImportSourceCommand): Promise<ImportSource>;
      getByID(id: string): Promise<ImportSource | null>;
      getByIngestionID(ingestionId: string): Promise<ImportSource | null>;
      readByID(id: string): Promise<Readable>;
      deleteByID(id: string): Promise<void>;
    }>();
    expectTypeOf<
      ApplicationError<"import_source.bucket_mismatch">["kind"]
    >().toEqualTypeOf<"conflict">();
    expectTypeOf<ApplicationError<"import_source.bucket_mismatch">["details"]>().toEqualTypeOf<{
      sourceId: string;
    }>();
    expectTypeOf<ApplicationError<"import_source.create_failed">["details"]>().toEqualTypeOf<{
      sourceId: string;
      reason: "size_mismatch" | "transfer_failed" | "finalization_failed";
      cleanupRequired: boolean;
    }>();
  });

  it("exports high-level ingestion submission and read-only processing", async () => {
    expect(Object.keys(await import("./features/ingestions/index.js"))).toEqual([
      "createIngestions",
    ]);
    expectTypeOf<typeof createIngestions>().toEqualTypeOf<
      (
        runtime: BackendRuntime,
        importSources: Pick<ImportSources, "upload" | "getByIngestionID" | "readByID">,
      ) => Ingestions
    >();
    expectTypeOf<Ingestions>().toEqualTypeOf<{
      process(ingestionId: string): Promise<{ importSourceId: string; bytesRead: number }>;
      submit(command: UploadImportSourceCommand): Promise<SubmitImportSourceDataReply>;
    }>();
  });

  it("exports the object-storage factory and caller types without an SDK operational interface", async () => {
    const entrypoint = await import("./object-storage/index.js");
    expect(Object.keys(entrypoint)).toEqual(["createObjectStorage"]);
    expectTypeOf(entrypoint.createObjectStorage)
      .parameter(0)
      .toEqualTypeOf<ObjectStorageConfiguration>();
    expectTypeOf(entrypoint.createObjectStorage).returns.toEqualTypeOf<ObjectStorage>();
    expectTypeOf<ObjectStorageConfiguration>().toEqualTypeOf<{
      bucket: string;
      region: string;
      credentials: { accessKeyId: string; secretAccessKey: string };
      endpoint?: string;
      forcePathStyle?: boolean;
    }>();
    expectTypeOf<ObjectStorageWriteCommand>().toEqualTypeOf<{
      key: string;
      body: Readable;
      expectedSizeBytes: number;
      signal?: AbortSignal;
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
