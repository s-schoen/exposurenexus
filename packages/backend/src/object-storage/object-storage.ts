import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { ApplicationError } from "../application-error.js";

export interface ObjectStorageConfiguration {
  bucket: string;
  region: string;
  credentials: { accessKeyId: string; secretAccessKey: string };
  endpoint?: string;
  forcePathStyle?: boolean;
}

export interface ObjectStorageWriteCommand {
  key: string;
  body: Readable;
  expectedSizeBytes: number;
}

export interface ObjectStorage {
  readonly bucket: string;
  write(command: ObjectStorageWriteCommand): Promise<void>;
  read(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  close(): void;
}

export function createObjectStorage(configuration: ObjectStorageConfiguration): ObjectStorage {
  const { bucket, region, credentials, endpoint, forcePathStyle } = configuration;
  if (
    !bucket.trim() ||
    !region.trim() ||
    !credentials.accessKeyId.trim() ||
    !credentials.secretAccessKey.trim() ||
    (endpoint !== undefined &&
      (!URL.canParse(endpoint) || !["http:", "https:"].includes(new URL(endpoint).protocol)))
  ) {
    throw new ApplicationError({
      code: "object_storage.invalid_configuration",
      kind: "validation",
      message: "Invalid object storage configuration",
    });
  }
  const client = new S3Client({
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
    },
    endpoint,
    forcePathStyle,
    maxAttempts: 1,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  return {
    get bucket() {
      return bucket;
    },
    async write({ key, body, expectedSizeBytes }) {
      if (
        !(body instanceof Readable) ||
        body.destroyed ||
        !body.readable ||
        !Number.isSafeInteger(expectedSizeBytes) ||
        expectedSizeBytes < 0
      ) {
        throw new ApplicationError({
          code: "object_storage.invalid_input",
          kind: "validation",
          message: "Object input must be a readable byte stream with a valid declared length",
        });
      }

      let bytes = 0;
      let ended = false;
      let sizeMismatch = false;
      const counter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          if (chunk.byteLength > expectedSizeBytes - bytes) {
            sizeMismatch = true;
            callback(new Error("Object size exceeds declared length"));
            return;
          }
          bytes += chunk.byteLength;
          callback(null, chunk);
        },
        flush(callback) {
          ended = true;
          sizeMismatch = bytes !== expectedSizeBytes;
          callback(sizeMismatch ? new Error("Object size differs from declared length") : null);
        },
      });
      const abort = new AbortController();
      const transfer = pipeline(body, counter);
      let upload: Promise<unknown> | undefined;
      try {
        upload = client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: counter,
            ContentLength: expectedSizeBytes,
          }),
          { abortSignal: abort.signal },
        );
        await Promise.all([transfer, upload]);
      } catch {
        abort.abort();
        // An error also settles inputs configured not to emit a close event on destruction.
        const cancelled = new Error("Object transfer cancelled");
        body.destroy(cancelled);
        counter.destroy(cancelled);
        await Promise.allSettled([transfer, upload]);
        throw new ApplicationError({
          code: "object_storage.write_failed",
          kind: "unexpected",
          message: "Failed to write object",
          details: {
            reason: sizeMismatch ? "size_mismatch" : "transfer_failed",
            // Only EOF establishes the complete input size, never an overrun or partial count.
            actualSize: ended ? bytes : null,
          },
        });
      }
    },
    async read(key) {
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        if (!(result.Body instanceof Readable)) throw new Error("Object has no readable body");
        return result.Body;
      } catch {
        throw new ApplicationError({
          code: "object_storage.read_failed",
          kind: "unexpected",
          message: "Failed to read object",
        });
      }
    },
    async delete(key) {
      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      } catch {
        throw new ApplicationError({
          code: "object_storage.delete_failed",
          kind: "unexpected",
          message: "Failed to delete object",
        });
      }
    },
    close() {
      client.destroy();
    },
  };
}
