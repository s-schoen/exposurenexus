import { JobType } from "@exposurenexus/jobs";
import { createJobRepository } from "@exposurenexus/jobs/postgres";
import { createJobService } from "@exposurenexus/jobs/service";

import { ApplicationError, isApplicationError } from "../../application-error.js";
import { getRuntimeDatabase, getRuntimeLogger, type BackendRuntime } from "../../runtime.js";

import type { ImportSources, UploadImportSourceCommand } from "../import-sources/index.js";

export interface Ingestions {
  process(ingestionId: string): Promise<{ importSourceId: string; bytesRead: number }>;
  submit(command: UploadImportSourceCommand): Promise<{
    importSourceId: string;
    ingestionId: string;
    jobId: string;
  }>;
}

export function createIngestions(
  runtime: BackendRuntime,
  importSources: Pick<ImportSources, "upload" | "getByIngestionID" | "readByID">,
): Ingestions {
  const database = getRuntimeDatabase(runtime);
  const logger = getRuntimeLogger(runtime).child({ capability: "ingestions" });

  return {
    async process(ingestionId) {
      const source = await importSources.getByIngestionID(ingestionId);
      if (!source) {
        throw new ApplicationError({
          code: "ingestion.source_not_found",
          kind: "missing",
          message: "Ingestion has no linked import source",
          details: { ingestionId },
        });
      }
      const body = await importSources.readByID(source.id);
      let bytesRead = 0;
      try {
        for await (const chunk of body) {
          bytesRead += Buffer.byteLength(chunk as Uint8Array);
        }
        if (bytesRead !== source.sizeBytes) {
          throw new Error("Import source size mismatch");
        }
      } catch {
        // Late stream errors may contain storage credentials; never expose their cause.
        throw new ApplicationError({
          code: "import_source.read_failed",
          kind: "unexpected",
          message: "Import source could not be read",
          details: { sourceId: source.id },
        });
      }
      return { importSourceId: source.id, bytesRead };
    },
    async submit(command) {
      await importSources.upload(command);

      const { importSourceId, performedBy, signal } = command;
      const checkCancellation = () => {
        if (signal.aborted) {
          throw new ApplicationError({
            code: "ingestion.submit_cancelled",
            kind: "conflict",
            message: "Ingestion submission was cancelled",
            details: { sourceId: importSourceId },
          });
        }
      };
      try {
        checkCancellation();
        return await database.transaction().execute(async (transaction) => {
          // Connection acquisition and BEGIN may have waited past cancellation.
          checkCancellation();
          const source = await transaction
            .selectFrom("import_source")
            .select(["source", "createdBy"])
            .where("id", "=", importSourceId)
            .where("createdBy", "=", performedBy)
            .where("state", "=", "available")
            .where("deletedAt", "is", null)
            .where("ingestionId", "is", null)
            .forUpdate()
            .executeTakeFirst();
          if (source?.source !== "nuclei") {
            throw new ApplicationError({
              code: "ingestion.source_not_submittable",
              kind: "conflict",
              message: "Import source is not eligible for ingestion submission",
              details: { sourceId: importSourceId },
            });
          }
          checkCancellation();
          const ingestion = await transaction
            .insertInto("ingestion")
            .values({ source: source.source, createdBy: source.createdBy, createdAt: new Date() })
            .returning("id")
            .executeTakeFirstOrThrow();
          const linked = await transaction
            .updateTable("import_source")
            .set({ ingestionId: ingestion.id })
            .where("id", "=", importSourceId)
            .where("ingestionId", "is", null)
            .returning("id")
            .executeTakeFirst();
          if (!linked) {
            throw new ApplicationError({
              code: "ingestion.source_not_submittable",
              kind: "conflict",
              message: "Import source could not be linked to the ingestion",
              details: { sourceId: importSourceId },
            });
          }
          const job = await createJobService({
            source: "/services/api",
            repository: createJobRepository(transaction),
            logger,
          }).create({ type: JobType.INGESTION, data: { ingestionId: ingestion.id } });
          return { importSourceId, ingestionId: ingestion.id, jobId: job.id };
        });
      } catch (error) {
        // Even a rejected COMMIT may have succeeded. Never compensate durable input here.
        logger.error({ sourceId: importSourceId }, "Ingestion submission failed; preserving input");
        if (isApplicationError(error)) throw error;
        throw new ApplicationError({
          code: "ingestion.submit_failed",
          kind: "unexpected",
          message: "Ingestion submission failed",
          details: { sourceId: importSourceId },
        });
      }
    },
  };
}
