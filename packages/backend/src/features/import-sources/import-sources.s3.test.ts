import { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";

import { pino } from "pino";
import { expect, it } from "vitest";

import { createTestDatabase } from "../../database/test/database.js";
import { createBackendRuntime } from "../../index.js";
import { createObjectStorage } from "../../object-storage/index.js";
import { createImportSources } from "./index.js";

const bucket = process.env.IMPORT_SOURCE_S3_TEST_BUCKET;
const region = process.env.IMPORT_SOURCE_S3_TEST_REGION;
const accessKeyId = process.env.IMPORT_SOURCE_S3_TEST_ACCESS_KEY_ID;
const secretAccessKey = process.env.IMPORT_SOURCE_S3_TEST_SECRET_ACCESS_KEY;
const configured = Boolean(bucket && region && accessKeyId && secretAccessKey);

it.skipIf(!configured)(
  "real S3 store/read/delete smoke (skipped when IMPORT_SOURCE_S3_TEST_* infrastructure is not configured)",
  async () => {
    const testDb = createTestDatabase();
    const storage = createObjectStorage({
      bucket: bucket!,
      region: region!,
      endpoint: process.env.IMPORT_SOURCE_S3_TEST_ENDPOINT,
      forcePathStyle: process.env.IMPORT_SOURCE_S3_TEST_FORCE_PATH_STYLE === "true",
      credentials: {
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!,
      },
    });
    const errors: unknown[] = [];
    try {
      await testDb.start();
      const sources = createImportSources(
        createBackendRuntime({ database: testDb.db, logger: pino({ enabled: false }) }),
        storage,
        { maxSizeBytes: 131075 },
      );
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
        sizeBytes: 131075,
        originalFilename: "s3-smoke.bin",
        performedBy: actor.id,
      });
      expect(await sources.getByID(source.id)).toMatchObject({
        state: "available",
        sizeBytes: 131075,
        retentionPolicy: "temporary",
      });
      const bytes = await buffer(await sources.readByID(source.id));
      expect(bytes).toEqual(
        Buffer.concat([Buffer.alloc(65536, 0x61), Buffer.alloc(65536, 0x62), Buffer.from("end")]),
      );
      await sources.deleteByID(source.id);
      const deleted = await sources.getByID(source.id);
      expect(deleted).toEqual({
        ...source,
        state: "deleted",
        deletedAt: expect.any(Date),
        cleanupRequired: false,
      });
      await sources.deleteByID(source.id);
      expect(await sources.getByID(source.id)).toEqual(deleted);
      await expect(sources.readByID(source.id)).rejects.toMatchObject({
        code: "import_source.not_available",
      });
      const missing = await sources.create({
        body: Readable.from([]),
        sizeBytes: 0,
        originalFilename: "s3-smoke-missing.bin",
        performedBy: actor.id,
      });
      const missingRecord = await testDb.db
        .selectFrom("import_source")
        .select(["bucket", "objectKey"])
        .where("id", "=", missing.id)
        .executeTakeFirstOrThrow();
      expect(missingRecord.bucket).toBe(storage.bucket);
      await storage.delete(missingRecord.objectKey);
      await expect(sources.readByID(missing.id)).rejects.toMatchObject({
        code: "import_source.read_failed",
      });
      await sources.deleteByID(missing.id);
      expect(await sources.getByID(missing.id)).toMatchObject({ state: "deleted" });
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
          records.map(async (record) => {
            if (record.bucket !== storage.bucket) {
              throw new Error("S3 smoke cleanup bucket mismatch for test-owned object");
            }
            await storage.delete(record.objectKey);
          }),
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
        storage.close();
        await testDb.dispose();
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, "Real S3 smoke test failed");
  },
  60000,
);
