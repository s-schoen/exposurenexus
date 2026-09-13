import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

import { ApplicationError } from "../../application-error.js";
import { getRuntimeDatabase, getRuntimeLogger, type BackendRuntime } from "../../runtime.js";
import * as persistence from "./import-source-persistence.js";

import type { ObjectStorage } from "../../object-storage/index.js";

export interface ImportSourcesConfiguration {
  maxSizeBytes?: number;
  retentionPolicy?: "temporary" | "keep";
}

export interface ImportSource {
  id: string;
  ingestionId: string | null;
  createdBy: string;
  originalFilename: string;
  mimeType: string | null;
  sizeBytes: number;
  retentionPolicy: "temporary" | "keep";
  state: "incomplete" | "available" | "deleted";
  createdAt: Date;
  availableAt: Date | null;
  failedAt: Date | null;
  deletedAt: Date | null;
  cleanupRequired: boolean;
}

export interface CreateImportSourceCommand {
  body: Readable;
  sizeBytes: number;
  originalFilename: string;
  mimeType?: string;
  performedBy: string;
}

export interface ImportSources {
  create(command: CreateImportSourceCommand): Promise<ImportSource>;
  getByID(id: string): Promise<ImportSource | null>;
  getByIngestionID(ingestionId: string): Promise<ImportSource | null>;
  readByID(id: string): Promise<Readable>;
  deleteByID(id: string): Promise<void>;
}

export function createImportSources(
  runtime: BackendRuntime,
  storage: ObjectStorage,
  configuration: ImportSourcesConfiguration = {},
): ImportSources {
  const database = getRuntimeDatabase(runtime);
  const logger = getRuntimeLogger(runtime).child({ capability: "import-sources" });
  const { bucket } = storage;
  const { retentionPolicy = "temporary", maxSizeBytes = 104857600 } = configuration;
  if (
    !Number.isSafeInteger(maxSizeBytes) ||
    maxSizeBytes < 0 ||
    !["temporary", "keep"].includes(retentionPolicy)
  ) {
    throw new ApplicationError({
      code: "import_source.invalid_configuration",
      kind: "validation",
      message: "Import source policy configuration is invalid",
    });
  }

  return {
    async create({ body, sizeBytes, originalFilename, mimeType, performedBy }) {
      if (
        !(body instanceof Readable) ||
        body.destroyed ||
        !body.readable ||
        !Number.isSafeInteger(sizeBytes) ||
        sizeBytes < 0 ||
        sizeBytes > maxSizeBytes
      ) {
        throw new ApplicationError({
          code: "import_source.invalid_input",
          kind: "validation",
          message: "Import source requires a valid declared size within the configured limit",
        });
      }
      const id = randomUUID();
      const objectKey = `import-sources/${randomUUID()}`;
      // Guard input until close, including errors while waiting for PostgreSQL
      // or destroying rejected input before storage can take ownership.
      let inputFailed = false;
      const onInputError = () => {
        inputFailed = true;
      };
      body.on("error", onInputError);
      body.once("close", () => body.removeListener("error", onInputError));
      try {
        await persistence.reserve(database, {
          id,
          ingestionId: null,
          objectKey,
          bucket,
          createdBy: performedBy,
          originalFilename,
          mimeType: mimeType?.trim() ? mimeType : null,
          sizeBytes,
          retentionPolicy,
          state: "incomplete",
          createdAt: new Date(),
          availableAt: null,
          failedAt: null,
          deletedAt: null,
          cleanupRequired: true,
        });
      } catch {
        body.destroy();
        throw new ApplicationError({
          code: "import_source.reserve_failed",
          kind: "unexpected",
          message: "Import source metadata could not be reserved",
        });
      }
      let transferred = false;
      try {
        if (inputFailed || body.destroyed || !body.readable) {
          body.destroy();
          throw new Error("Import source input failed during reservation");
        }
        await storage.write({
          key: objectKey,
          body,
          expectedSizeBytes: sizeBytes,
        });
        transferred = true;
        return await persistence.finalize(database, id);
      } catch (error) {
        const failure =
          !transferred &&
          error instanceof ApplicationError &&
          error.code === "object_storage.write_failed"
            ? (error as ApplicationError<"object_storage.write_failed">).details
            : null;
        // A rejected storage write has already stopped and settled its local transfer.
        let cleanupRequired = true;
        let safeToCleanup = !transferred;
        if (transferred) {
          body.destroy();
          // Finalization may have committed before its response was lost. Revoke
          // availability durably before deleting bytes; preserve them if uncertain.
          try {
            await persistence.recordFailure(database, id, true);
            safeToCleanup = true;
          } catch {
            logger.error(
              { sourceId: id, cleanupRequired },
              "Import source availability is uncertain; preserving object",
            );
          }
        }
        if (safeToCleanup) {
          try {
            await storage.delete(objectKey);
            cleanupRequired = false;
          } catch {
            cleanupRequired = true;
          }
          try {
            await persistence.recordFailure(database, id, cleanupRequired);
          } catch {
            // Availability is already revoked; only the cleanup outcome is uncertain.
            logger.error(
              { sourceId: id, cleanupRequired },
              "Import source failure bookkeeping failed",
            );
          }
        }
        logger.warn({ sourceId: id, cleanupRequired }, "Import source creation failed");
        throw new ApplicationError({
          code: "import_source.create_failed",
          kind: "unexpected",
          message: "Import source creation failed",
          details: {
            sourceId: id,
            reason: transferred ? "finalization_failed" : (failure?.reason ?? "transfer_failed"),
            cleanupRequired,
          },
        });
      }
    },
    async getByID(id) {
      try {
        return await persistence.getMetadata(database, id);
      } catch {
        throw new ApplicationError({
          code: "import_source.get_failed",
          kind: "unexpected",
          message: "Import source metadata could not be read",
          details: { sourceId: id },
        });
      }
    },
    async getByIngestionID(ingestionId) {
      try {
        return await persistence.getMetadataByIngestionID(database, ingestionId);
      } catch {
        throw new ApplicationError({
          code: "import_source.get_by_ingestion_failed",
          kind: "unexpected",
          message: "Import source metadata could not be read by ingestion",
          details: { ingestionId },
        });
      }
    },
    async readByID(id) {
      const source = await persistence.getRecord(database, id).catch(() => {
        throw new ApplicationError({
          code: "import_source.get_failed",
          kind: "unexpected",
          message: "Import source metadata could not be read",
          details: { sourceId: id },
        });
      });
      if (!source)
        throw new ApplicationError({
          code: "import_source.not_found",
          kind: "missing",
          message: "Import source not found",
          details: { sourceId: id },
        });
      if (source.state !== "available" || source.deletedAt !== null) {
        throw new ApplicationError({
          code: "import_source.not_available",
          kind: "conflict",
          message: "Import source bytes are not available",
          details: { sourceId: id },
        });
      }
      if (source.bucket !== bucket) {
        throw new ApplicationError({
          code: "import_source.bucket_mismatch",
          kind: "conflict",
          message: "Import source requires storage bound to its recorded bucket",
          details: { sourceId: id },
        });
      }
      try {
        return await storage.read(source.objectKey);
      } catch {
        throw new ApplicationError({
          code: "import_source.read_failed",
          kind: "unexpected",
          message: "Import source could not be read",
          details: { sourceId: id },
        });
      }
    },
    async deleteByID(id) {
      const source = await persistence.getRecord(database, id).catch(() => {
        throw new ApplicationError({
          code: "import_source.get_failed",
          kind: "unexpected",
          message: "Import source metadata could not be read",
          details: { sourceId: id },
        });
      });
      if (!source)
        throw new ApplicationError({
          code: "import_source.not_found",
          kind: "missing",
          message: "Import source not found",
          details: { sourceId: id },
        });
      if (source.state === "deleted") return;
      if (source.bucket !== bucket) {
        throw new ApplicationError({
          code: "import_source.bucket_mismatch",
          kind: "conflict",
          message: "Import source requires storage bound to its recorded bucket",
          details: { sourceId: id },
        });
      }
      let removed = false;
      try {
        await storage.delete(source.objectKey);
        removed = true;
        await persistence.recordDeletion(database, id);
      } catch {
        throw new ApplicationError({
          code: "import_source.delete_failed",
          kind: "unexpected",
          message: "Import source deletion could not be completed",
          details: {
            sourceId: id,
            reason: removed ? "bookkeeping_failed" : "storage_failed",
          },
        });
      }
    },
  };
}
