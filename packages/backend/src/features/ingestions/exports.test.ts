import { createRequire } from "node:module";

import { describe, expect, expectTypeOf, it } from "vitest";

import type { ApplicationError, BackendRuntime } from "@exposurenexus/backend";
import type {
  ImportSources,
  UploadImportSourceCommand,
} from "@exposurenexus/backend/import-sources";
import type { createIngestions, Ingestions } from "@exposurenexus/backend/ingestions";

describe("ingestions exports", () => {
  it("exports only the high-level factory at the plural capability subpath", async () => {
    expect(Object.keys(await import("./index.js"))).toEqual(["createIngestions"]);
    const require = createRequire(import.meta.url);
    for (const subpath of ["ingestion", "ingestions/ingestions", "features/ingestions/index"]) {
      expect(() => require.resolve(`@exposurenexus/backend/${subpath}`)).toThrow(
        expect.objectContaining({ code: "ERR_PACKAGE_PATH_NOT_EXPORTED" }),
      );
    }
    expectTypeOf<typeof createIngestions>().toEqualTypeOf<
      (
        runtime: BackendRuntime,
        importSources: Pick<ImportSources, "upload" | "getByIngestionID" | "readByID">,
      ) => Ingestions
    >();
    expectTypeOf<Ingestions>().toEqualTypeOf<{
      process(ingestionId: string): Promise<{ importSourceId: string; bytesRead: number }>;
      submit(command: UploadImportSourceCommand): Promise<{
        importSourceId: string;
        ingestionId: string;
        jobId: string;
      }>;
    }>();
    expectTypeOf<
      ApplicationError<"ingestion.source_not_found">["kind"]
    >().toEqualTypeOf<"missing">();
    expectTypeOf<ApplicationError<"ingestion.source_not_found">["details"]>().toEqualTypeOf<{
      ingestionId: string;
    }>();
    expectTypeOf<
      ApplicationError<"ingestion.source_not_submittable">["kind"]
    >().toEqualTypeOf<"conflict">();
    expectTypeOf<ApplicationError<"ingestion.source_not_submittable">["details"]>().toEqualTypeOf<{
      sourceId: string;
    }>();
    expectTypeOf<
      ApplicationError<"ingestion.submit_failed">["kind"]
    >().toEqualTypeOf<"unexpected">();
    expectTypeOf<ApplicationError<"ingestion.submit_failed">["details"]>().toEqualTypeOf<{
      sourceId: string;
    }>();
  });
});
