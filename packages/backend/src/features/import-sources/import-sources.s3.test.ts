import { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";

import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { pino } from "pino";
import { expect, it } from "vitest";

import { createTestDatabase } from "../../database/test/database.js";
import { createBackendRuntime } from "../../index.js";
import { createImportSources, type ImportSourcesConfiguration } from "./index.js";

const bucket = process.env.IMPORT_SOURCE_S3_TEST_BUCKET;
const region = process.env.IMPORT_SOURCE_S3_TEST_REGION;
const accessKeyId = process.env.IMPORT_SOURCE_S3_TEST_ACCESS_KEY_ID;
const secretAccessKey = process.env.IMPORT_SOURCE_S3_TEST_SECRET_ACCESS_KEY;
const configured = Boolean(bucket && region && accessKeyId && secretAccessKey);

it.skipIf(!configured)(
  "real S3 store/read smoke (skipped when IMPORT_SOURCE_S3_TEST_* infrastructure is not configured)",
  async () => {
    const testDb = createTestDatabase();
    await testDb.start();
    const configuration: ImportSourcesConfiguration = {
      bucket: bucket!,
      region: region!,
      endpoint: process.env.IMPORT_SOURCE_S3_TEST_ENDPOINT,
      forcePathStyle: process.env.IMPORT_SOURCE_S3_TEST_FORCE_PATH_STYLE === "true",
      credentials: async () => ({
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!,
        sessionToken: process.env.IMPORT_SOURCE_S3_TEST_SESSION_TOKEN,
      }),
      maxSizeBytes: 131075,
    };
    const sources = createImportSources(
      createBackendRuntime({ database: testDb.db, logger: pino({ enabled: false }) }),
      configuration,
    );
    const cleanup = new S3Client({ ...configuration, maxAttempts: 1 });
    const errors: unknown[] = [];
    try {
      const actor = await testDb.db
        .insertInto("user_profile")
        .values({
          username: "s3-smoke",
          email: "s3-smoke@example.test",
          displayName: "S3 smoke",
          enabled: true,
          passwordHash: "unused",
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      const source = await sources.create({
        body: Readable.from([
          Buffer.alloc(65536, 0x61),
          Buffer.alloc(65536, 0x62),
          Buffer.from("end"),
        ]),
        expectedSize: 131075,
        originalFilename: "s3-smoke.bin",
        performedBy: actor.id,
      });
      expect(await sources.getByID(source.id)).toMatchObject({
        state: "available",
        actualSize: 131075,
        retentionPolicy: "temporary",
      });
      const bytes = await buffer(await sources.readByID(source.id));
      expect(bytes).toEqual(
        Buffer.concat([Buffer.alloc(65536, 0x61), Buffer.alloc(65536, 0x62), Buffer.from("end")]),
      );
    } catch (error) {
      errors.push(error);
    } finally {
      try {
        // This in-memory database belongs exclusively to this test, including failed reservations.
        // Never list a bucket or delete a prefix: remove only these exact test-owned object references.
        const records = await testDb.db
          .selectFrom("import_source")
          .select(["bucket", "objectKey"])
          .execute();
        const results = await Promise.allSettled(
          records.map((record) =>
            cleanup.send(new DeleteObjectCommand({ Bucket: record.bucket, Key: record.objectKey })),
          ),
        );
        if (results.some((result) => result.status === "rejected")) {
          errors.push(
            new Error(
              `S3 smoke cleanup failed; test-owned objects may remain: ${records.map((record) => record.objectKey).join(", ")}`,
            ),
          );
        }
      } catch {
        errors.push(new Error("S3 smoke cleanup metadata lookup failed"));
      } finally {
        sources.close();
        cleanup.destroy();
        await testDb.dispose();
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, "Real S3 smoke test failed");
  },
  60000,
);
