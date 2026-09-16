import { randomUUID } from "node:crypto";
import { addAbortSignal, Readable } from "node:stream";

import { registerImportSourceSchema } from "@exposurenexus/contracts/api";
import { z } from "zod/v4";

import { ApplicationError } from "../../application-error.js";
import { getRuntimeDatabase, getRuntimeLogger, type BackendRuntime } from "../../runtime.js";
import * as persistence from "./import-source-persistence.js";

import type { ObjectStorage } from "../../object-storage/index.js";
import type { ImportSourceTable } from "./import-source-table.js";
import type { RegisterImportSource } from "@exposurenexus/contracts/api";

const registerCommandSchema = registerImportSourceSchema.extend({ performedBy: z.uuidv4() });
const uploadCommandSchema = z.strictObject({
  importSourceId: z.uuidv4().toLowerCase(),
  performedBy: z.uuidv4().toLowerCase(),
  body: z.instanceof(Readable).refine((body) => !body.destroyed && body.readable),
  contentLength: z.number().int().nonnegative().optional(),
  signal: z.instanceof(AbortSignal),
});

export interface ImportSourcesConfiguration {
  maxSizeBytes?: number;
  retentionPolicy?: "temporary" | "keep";
}

export interface ImportSource {
  id: string;
  ingestionId: string | null;
  source: RegisterImportSource["source"] | null;
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
}

export interface CreateImportSourceCommand {
  body: Readable;
  sizeBytes: number;
  originalFilename: string;
  mimeType?: string;
  performedBy: string;
}

export interface RegisterImportSourceCommand extends RegisterImportSource {
  performedBy: string;
}

export interface UploadImportSourceCommand {
  importSourceId: string;
  performedBy: string;
  body: Readable;
  contentLength?: number;
  signal: AbortSignal;
}

export interface ImportSources {
  register(command: RegisterImportSourceCommand): Promise<ImportSource>;
  upload(command: UploadImportSourceCommand): Promise<ImportSource>;
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

  async function requireSource(id: string) {
    const source = await persistence.getRecord(database, id).catch(() => {
      throw new ApplicationError({
        code: "import_source.get_failed",
        kind: "unexpected",
        message: "Import source metadata could not be read",
        details: { sourceId: id },
      });
    });
    if (!source) {
      throw new ApplicationError({
        code: "import_source.not_found",
        kind: "missing",
        message: "Import source not found",
        details: { sourceId: id },
      });
    }
    return source;
  }

  function ownInput(body: Readable, signal?: AbortSignal) {
    // Guard errors during database waits and asynchronous destruction before storage owns input.
    const onInputError = () => body.destroy();
    body.on("error", onInputError);
    body.once("close", () => body.removeListener("error", onInputError));
    if (signal) addAbortSignal(signal, body);
  }

  async function transfer(
    { id, objectKey, sizeBytes }: Pick<ImportSourceTable, "id" | "objectKey" | "sizeBytes">,
    body: Readable,
    signal?: AbortSignal,
  ) {
    let transferred = false;
    try {
      signal?.throwIfAborted();
      if (body.destroyed || !body.readable) {
        body.destroy();
        throw new Error("Import source input failed before transfer");
      }
      await storage.write({ key: objectKey, body, expectedSizeBytes: sizeBytes, signal });
      signal?.throwIfAborted();
      transferred = true;
      // After durable finalization returns, cancellation belongs to the caller, not compensation.
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
  }

  return {
    async register(command) {
      const parsed = registerCommandSchema.safeParse(command);
      if (!parsed.success || parsed.data.sizeBytes > maxSizeBytes) {
        throw new ApplicationError({
          code: "import_source.invalid_input",
          kind: "validation",
          message:
            "Import source requires valid metadata and a declared size within the configured limit",
        });
      }
      const { source, originalFilename, sizeBytes, mimeType, performedBy } = parsed.data;
      try {
        return await persistence.reserve(database, {
          id: randomUUID(),
          ingestionId: null,
          source,
          objectKey: `import-sources/${randomUUID()}`,
          bucket,
          createdBy: performedBy,
          originalFilename,
          mimeType: mimeType?.trim() ? mimeType : null,
          sizeBytes,
          retentionPolicy,
          state: "incomplete",
          createdAt: new Date(),
          uploadStartedAt: null,
          availableAt: null,
          failedAt: null,
          deletedAt: null,
          cleanupRequired: true,
        });
      } catch {
        throw new ApplicationError({
          code: "import_source.reserve_failed",
          kind: "unexpected",
          message: "Import source metadata could not be reserved",
        });
      }
    },
    async upload(command) {
      const parsed = uploadCommandSchema.safeParse(command);
      if (!parsed.success) {
        throw new ApplicationError({
          code: "import_source.invalid_input",
          kind: "validation",
          message:
            "Import source upload requires valid identities, input, length, and cancellation signal",
        });
      }
      const { importSourceId: id, performedBy, body, contentLength, signal } = parsed.data;
      ownInput(body, signal);
      let claimed: ImportSourceTable;
      try {
        signal.throwIfAborted();
        const source = await requireSource(id);
        if (source.createdBy !== performedBy) {
          throw new ApplicationError({
            code: "import_source.upload_forbidden",
            kind: "denied",
            message: "Only the import source creator may upload its bytes",
            details: { sourceId: id },
          });
        }
        if (source.uploadStartedAt !== null) {
          throw new ApplicationError({
            code: "import_source.upload_already_attempted",
            kind: "conflict",
            message: "Import source is not an unused upload registration",
            details: { sourceId: id },
          });
        }
        if (
          source.sizeBytes > maxSizeBytes ||
          (contentLength !== undefined && contentLength !== source.sizeBytes) ||
          body.destroyed ||
          !body.readable
        ) {
          signal.throwIfAborted();
          throw new ApplicationError({
            code: "import_source.invalid_input",
            kind: "validation",
            message:
              "Import source upload requires readable input and the registered length within the configured limit",
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
        signal.throwIfAborted();
        const record = await persistence.claimUpload(database, id, performedBy).catch(() => {
          throw new ApplicationError({
            code: "import_source.claim_failed",
            kind: "unexpected",
            message: "Import source upload attempt could not be claimed",
            details: { sourceId: id },
          });
        });
        if (!record) {
          throw new ApplicationError({
            code: "import_source.upload_already_attempted",
            kind: "conflict",
            message: "Import source is not an unused upload registration",
            details: { sourceId: id },
          });
        }
        claimed = record;
      } catch (error) {
        body.destroy();
        // No confirmed claim means no ownership of bytes, including an uncertain claim outcome.
        if (signal.aborted && Object.is(error, signal.reason)) {
          throw new ApplicationError({
            code: "import_source.upload_cancelled",
            kind: "conflict",
            message: "Import source upload was cancelled",
            details: { sourceId: id },
          });
        }
        throw error;
      }
      return await transfer(claimed, body, signal);
    },
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
      ownInput(body);
      try {
        await persistence.reserve(database, {
          id,
          ingestionId: null,
          source: null,
          objectKey,
          bucket,
          createdBy: performedBy,
          originalFilename,
          mimeType: mimeType?.trim() ? mimeType : null,
          sizeBytes,
          retentionPolicy,
          state: "incomplete",
          createdAt: new Date(),
          uploadStartedAt: new Date(),
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
      return await transfer({ id, objectKey, sizeBytes }, body);
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
      const source = await requireSource(id);
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
      const source = await requireSource(id);
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
