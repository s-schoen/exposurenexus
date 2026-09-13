import { randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";

import { ApplicationError } from "../../application-error.js";
import { getRuntimeDatabase, getRuntimeLogger, type BackendRuntime } from "../../runtime.js";
import * as persistence from "./import-source-persistence.js";

export interface ImportSourcesConfiguration {
  bucket: string;
  region: string;
  credentials: NonNullable<S3ClientConfig["credentials"]>;
  endpoint?: string;
  forcePathStyle?: boolean;
  maxSizeBytes?: number;
  retentionPolicy?: "temporary" | "keep";
}

export interface ImportSource {
  id: string;
  ingestionId: string | null;
  createdBy: string;
  originalFilename: string;
  expectedSize: number;
  actualSize: number | null;
  retentionPolicy: "temporary" | "keep";
  state: "incomplete" | "available" | "deleted";
  createdAt: Date;
  availableAt: Date | null;
  failedAt: Date | null;
  deletedAt: Date | null;
  cleanupState: "not_needed" | "pending" | "completed" | "failed";
}

export interface CreateImportSourceCommand {
  body: Readable;
  expectedSize: number;
  originalFilename: string;
  performedBy: string;
}

export interface ImportSources {
  create(command: CreateImportSourceCommand): Promise<ImportSource>;
  getByID(id: string): Promise<ImportSource | null>;
  getByIngestionID(ingestionId: string): Promise<ImportSource | null>;
  readByID(id: string): Promise<Readable>;
  deleteByID(id: string): Promise<void>;
  close(): void;
}

export function createImportSources(
  runtime: BackendRuntime,
  configuration: ImportSourcesConfiguration,
): ImportSources {
  const database = getRuntimeDatabase(runtime);
  const logger = getRuntimeLogger(runtime).child({ capability: "import-sources" });
  const { bucket, retentionPolicy = "temporary", maxSizeBytes = 104857600 } = configuration;
  if (
    !Number.isSafeInteger(maxSizeBytes) ||
    maxSizeBytes < 0 ||
    !bucket?.trim() ||
    !configuration.region?.trim() ||
    !configuration.credentials ||
    !["temporary", "keep"].includes(retentionPolicy)
  ) {
    throw new ApplicationError({
      code: "import_source.invalid_configuration",
      kind: "validation",
      message: "Import source storage configuration is invalid",
    });
  }
  const client = new S3Client({
    region: configuration.region,
    credentials: configuration.credentials,
    endpoint: configuration.endpoint,
    forcePathStyle: configuration.forcePathStyle,
    maxAttempts: 1,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  return {
    async create(command) {
      if (
        !(command.body instanceof Readable) ||
        command.body.destroyed ||
        !command.body.readable ||
        !Number.isSafeInteger(command.expectedSize) ||
        command.expectedSize < 0 ||
        command.expectedSize > maxSizeBytes
      ) {
        throw new ApplicationError({
          code: "import_source.invalid_input",
          kind: "validation",
          message: "Import source requires a valid declared size within the configured limit",
        });
      }
      const id = randomUUID();
      const objectKey = `import-sources/${randomUUID()}`;
      // Input can fail while reservation is awaiting PostgreSQL, before pipeline owns it.
      const onInputError = () => {};
      command.body.on("error", onInputError);
      try {
        await persistence.reserve(database, {
          id,
          ingestionId: null,
          objectKey,
          bucket,
          createdBy: command.performedBy,
          originalFilename: command.originalFilename,
          expectedSize: command.expectedSize,
          actualSize: null,
          retentionPolicy,
          state: "incomplete",
          createdAt: new Date(),
          availableAt: null,
          failedAt: null,
          deletedAt: null,
          cleanupState: "pending",
        });
      } catch {
        command.body.destroy();
        throw new ApplicationError({
          code: "import_source.reserve_failed",
          kind: "unexpected",
          message: "Import source metadata could not be reserved",
        });
      }
      let bytes = 0;
      let ended = false;
      let sizeMismatch = false;
      let transferred = false;
      const counter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          bytes += chunk.byteLength;
          if (bytes > maxSizeBytes || bytes > command.expectedSize) {
            sizeMismatch = true;
            callback(new Error("Import source exceeds declared size or configured limit"));
          } else {
            callback(null, chunk);
          }
        },
        flush(callback) {
          ended = true;
          sizeMismatch = bytes !== command.expectedSize;
          callback(sizeMismatch ? new Error("Import source shorter than declared size") : null);
        },
      });
      const abort = new AbortController();
      const transfer = pipeline(command.body, counter);
      command.body.removeListener("error", onInputError);
      const upload = client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          Body: counter,
          ContentLength: command.expectedSize,
        }),
        { abortSignal: abort.signal },
      );
      try {
        await Promise.all([transfer, upload]);
        transferred = true;
        return await persistence.finalize(database, id, bytes);
      } catch {
        abort.abort();
        command.body.destroy();
        counter.destroy();
        // Wait for local request shutdown before attempting compensation.
        await Promise.allSettled([transfer, upload]);
        let cleanupState: "pending" | "completed" | "failed" = "pending";
        let safeToCleanup = !transferred;
        if (transferred) {
          // Finalization may have committed before its response was lost. Revoke
          // availability durably before deleting bytes; preserve them if uncertain.
          try {
            await persistence.recordFailure(database, id, bytes, "pending");
            safeToCleanup = true;
          } catch {
            logger.error(
              { sourceId: id, cleanupState },
              "Import source availability is uncertain; preserving object",
            );
          }
        }
        if (safeToCleanup) {
          try {
            await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
            cleanupState = "completed";
          } catch {
            cleanupState = "failed";
          }
          try {
            await persistence.recordFailure(database, id, ended ? bytes : null, cleanupState);
          } catch {
            // Availability is already revoked; only the cleanup outcome is uncertain.
            logger.error(
              { sourceId: id, cleanupState },
              "Import source failure bookkeeping failed",
            );
          }
        }
        logger.warn({ sourceId: id, cleanupState }, "Import source creation failed");
        throw new ApplicationError({
          code: "import_source.create_failed",
          kind: "unexpected",
          message: "Import source creation failed",
          details: {
            sourceId: id,
            reason: sizeMismatch
              ? "size_mismatch"
              : transferred
                ? "finalization_failed"
                : "transfer_failed",
            cleanupState,
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
      try {
        const result = await client.send(
          new GetObjectCommand({ Bucket: source.bucket, Key: source.objectKey }),
        );
        if (!(result.Body instanceof Readable)) throw new Error("Missing readable body");
        return result.Body;
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
      let removed = false;
      try {
        // S3 DeleteObject also succeeds when the key is already absent.
        await client.send(
          new DeleteObjectCommand({ Bucket: source.bucket, Key: source.objectKey }),
        );
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
    close() {
      client.destroy();
    },
  };
}
