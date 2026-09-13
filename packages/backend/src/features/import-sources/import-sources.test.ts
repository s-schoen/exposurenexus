import { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import { setImmediate } from "node:timers/promises";

import { sql } from "kysely";
import { pino } from "pino";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDatabase } from "../../database/test/database.js";
import { ApplicationError, createBackendRuntime } from "../../index.js";
import { createImportSources, type ImportSourcesConfiguration } from "./index.js";

import type { ObjectStorage } from "../../object-storage/index.js";

const actorId = "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("import sources", () => {
  const testDb = createTestDatabase();
  const objects = new Map<string, Buffer>();
  const storage = {
    bucket: "private-input",
    write: vi.fn<ObjectStorage["write"]>(),
    read: vi.fn<ObjectStorage["read"]>(),
    delete: vi.fn<ObjectStorage["delete"]>(),
    close: vi.fn<ObjectStorage["close"]>(),
  } satisfies ObjectStorage;
  let failWrite = false;
  let failDelete = false;

  beforeAll(async () => {
    await testDb.start();
    await testDb.db
      .insertInto("user_profile")
      .values({
        id: actorId,
        username: "importer",
        email: "importer@example.test",
        displayName: "Importer",
        enabled: true,
        passwordHash: "unused",
      })
      .execute();
  });
  afterAll(async () => await testDb.dispose());
  afterEach(async () => {
    storage.close();
    vi.restoreAllMocks();
    await sql`drop trigger if exists fail_import_source_update on import_source`.execute(testDb.db);
    await sql`drop function if exists fail_import_source_update()`.execute(testDb.db);
  });
  beforeEach(() => {
    objects.clear();
    failWrite = false;
    failDelete = false;
    storage.close.mockClear();
    storage.write.mockReset().mockImplementation(async ({ key, body, expectedSize }) => {
      if (body.destroyed || !body.readable) {
        throw new ApplicationError({
          code: "object_storage.invalid_input",
          kind: "validation",
          message: "Input is no longer readable",
        });
      }
      objects.set(key, await buffer(body));
      if (failWrite) {
        throw new ApplicationError({
          code: "object_storage.write_failed",
          kind: "unexpected",
          message: "private-storage-failure",
          details: { reason: "transfer_failed", actualSize: expectedSize },
        });
      }
    });
    storage.read.mockReset().mockImplementation(async (key) => {
      const bytes = objects.get(key);
      if (!bytes) {
        throw new ApplicationError({
          code: "object_storage.read_failed",
          kind: "unexpected",
          message: "private-storage-failure",
        });
      }
      return Readable.from([bytes]);
    });
    storage.delete.mockReset().mockImplementation(async (key) => {
      if (failDelete) {
        throw new ApplicationError({
          code: "object_storage.delete_failed",
          kind: "unexpected",
          message: "private-storage-failure",
        });
      }
      objects.delete(key);
    });
  });

  function capability(
    configuration: ImportSourcesConfiguration = {},
    objectStorage: ObjectStorage = storage,
  ) {
    return createImportSources(
      createBackendRuntime({
        database: testDb.db,
        logger: pino({ enabled: false }),
      }),
      objectStorage,
      configuration,
    );
  }

  it.each([undefined, null, Buffer.from("not a stream"), {}])(
    "rejects non-readable input %s",
    async (body) => {
      await expect(
        capability().create({
          body: body as never,
          expectedSize: 0,
          originalFilename: "scan",
          performedBy: actorId,
        }),
      ).rejects.toMatchObject({ code: "import_source.invalid_input", kind: "validation" });
      expect(storage.write).not.toHaveBeenCalled();
    },
  );

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid configured limit %s",
    (maxSizeBytes) => {
      expect(() => capability({ maxSizeBytes })).toThrow(
        expect.objectContaining({ code: "import_source.invalid_configuration" }),
      );
    },
  );

  it("rejects invalid retention policy without taking ownership of storage", () => {
    expect(() => capability({ retentionPolicy: "forever" as never })).toThrow(
      expect.objectContaining({ code: "import_source.invalid_configuration", kind: "validation" }),
    );
    expect(storage.write).not.toHaveBeenCalled();
    expect(storage.close).not.toHaveBeenCalled();
  });

  it("shares caller-owned storage and snapshots size and retention policy per capability", async () => {
    const runtime = createBackendRuntime({ database: testDb.db, logger: pino({ enabled: false }) });
    const config: ImportSourcesConfiguration = { maxSizeBytes: 4 };
    const temporary = createImportSources(runtime, storage, config);
    const first = await temporary.create({
      body: Readable.from([Buffer.from("1234")]),
      expectedSize: 4,
      originalFilename: "scan",
      performedBy: actorId,
    });
    config.retentionPolicy = "keep";
    const retained = createImportSources(runtime, storage, config);
    config.maxSizeBytes = 0;
    const second = await retained.create({
      body: Readable.from([]),
      expectedSize: 0,
      originalFilename: "scan",
      performedBy: actorId,
    });
    expect(await retained.getByID(first.id)).toMatchObject({
      retentionPolicy: "temporary",
      actualSize: 4,
    });
    expect(second).toMatchObject({ retentionPolicy: "keep", actualSize: 0, state: "available" });
    expect(second.id).not.toBe(first.id);
    expect(objects.size).toBe(2);
    expect(await buffer(await retained.readByID(second.id))).toEqual(Buffer.alloc(0));
    expect(
      await temporary.create({
        body: Readable.from([Buffer.from("1234")]),
        expectedSize: 4,
        originalFilename: "scan",
        performedBy: actorId,
      }),
    ).toMatchObject({ retentionPolicy: "temporary", actualSize: 4 });
    await temporary.deleteByID(first.id);
    expect(await buffer(await retained.readByID(second.id))).toEqual(Buffer.alloc(0));
    expect(temporary).not.toHaveProperty("close");
    expect(retained).not.toHaveProperty("close");
    expect(storage.close).not.toHaveBeenCalled();
  });

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 104857601])(
    "rejects invalid declared length %s before consuming input or contacting storage",
    async (expectedSize) => {
      const sources = capability();
      const body = Readable.from([Buffer.from("unused")]);
      await expect(
        sources.create({ body, expectedSize, originalFilename: "scan", performedBy: actorId }),
      ).rejects.toMatchObject({ code: "import_source.invalid_input", kind: "validation" });
      expect(body.readableDidRead).toBe(false);
      expect(storage.write).not.toHaveBeenCalled();
      body.destroy();
    },
  );

  it("rejects destroyed and exhausted input before reserving or transferring", async () => {
    const destroyed = new Readable({ read() {} });
    destroyed.destroy();
    const exhausted = Readable.from([]);
    await buffer(exhausted);
    for (const body of [destroyed, exhausted]) {
      await expect(
        capability().create({
          body,
          expectedSize: 0,
          originalFilename: "scan",
          performedBy: actorId,
        }),
      ).rejects.toMatchObject({ code: "import_source.invalid_input" });
    }
    expect(storage.write).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("stores streamed bytes and exposes durable identity and provenance without storage secrets", async () => {
    const sources = capability();
    const source = await sources.create({
      body: Readable.from([Buffer.from("hello"), Buffer.from(" world")]),
      expectedSize: 11,
      originalFilename: "../../scan.jsonl",
      performedBy: actorId,
    });
    expect(source).toEqual({
      id: expect.any(String),
      ingestionId: null,
      originalFilename: "../../scan.jsonl",
      createdBy: actorId,
      expectedSize: 11,
      actualSize: 11,
      retentionPolicy: "temporary",
      state: "available",
      createdAt: expect.any(Date),
      availableAt: expect.any(Date),
      failedAt: null,
      deletedAt: null,
      cleanupState: "not_needed",
    });
    expect(await sources.getByID(source.id)).toEqual(source);
    expect(await buffer(await sources.readByID(source.id))).toEqual(Buffer.from("hello world"));
    expect([...objects.keys()][0]).not.toContain("scan.jsonl");
  });

  it.each(["success", "failure"])(
    "reserves the complete storage reference and waits for write %s before finalizing or compensating",
    async (outcome) => {
      const writing = deferred();
      const settled = deferred();
      const body = Readable.from([Buffer.from("abc")]);
      const sources = capability({ retentionPolicy: "keep" });
      let sourceId = "";
      storage.write.mockImplementationOnce(async (command) => {
        const reserved = await testDb.db
          .selectFrom("import_source")
          .selectAll()
          .where("objectKey", "=", command.key)
          .executeTakeFirstOrThrow();
        sourceId = reserved.id;
        expect(reserved).toEqual({
          id: expect.any(String),
          ingestionId: null,
          bucket: "private-input",
          objectKey: expect.stringMatching(
            /^import-sources\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
          ),
          createdBy: actorId,
          originalFilename: "../../scan.jsonl",
          expectedSize: 3,
          actualSize: null,
          retentionPolicy: "keep",
          state: "incomplete",
          createdAt: expect.any(Date),
          availableAt: null,
          failedAt: null,
          deletedAt: null,
          cleanupState: "pending",
        });
        expect(command.body).toBe(body);
        expect(command.expectedSize).toBe(3);
        objects.set(command.key, await buffer(command.body));
        writing.resolve();
        await settled.promise;
        if (outcome === "failure") {
          throw new ApplicationError({
            code: "object_storage.write_failed",
            kind: "unexpected",
            message: "private-storage-failure",
            details: { reason: "transfer_failed", actualSize: 3 },
          });
        }
      });
      const command = {
        body,
        expectedSize: 3,
        originalFilename: "../../scan.jsonl",
        performedBy: actorId,
      };
      const result = sources.create(command);
      try {
        await writing.promise;
        command.expectedSize = 1;
        expect(await sources.getByID(sourceId)).toMatchObject({
          state: "incomplete",
          actualSize: null,
          availableAt: null,
          failedAt: null,
        });
        expect(storage.delete).not.toHaveBeenCalled();
        await expect(sources.readByID(sourceId)).rejects.toMatchObject({
          code: "import_source.not_available",
        });
      } finally {
        settled.resolve();
      }
      if (outcome === "success") {
        await expect(result).resolves.toMatchObject({ state: "available", actualSize: 3 });
        expect(storage.delete).not.toHaveBeenCalled();
      } else {
        await expect(result).rejects.toMatchObject({
          code: "import_source.create_failed",
          details: { sourceId, reason: "transfer_failed", cleanupState: "completed" },
        });
        expect(storage.delete).toHaveBeenCalledOnce();
        expect(await sources.getByID(sourceId)).toMatchObject({
          state: "incomplete",
          actualSize: 3,
          failedAt: expect.any(Date),
          cleanupState: "completed",
        });
      }
    },
  );

  it("resolves source provenance by ingestion identity independently of byte availability", async () => {
    const sources = capability({ retentionPolicy: "keep" });
    const source = await sources.create({
      body: Readable.from([Buffer.from("abc")]),
      expectedSize: 3,
      originalFilename: "scan.jsonl",
      performedBy: actorId,
    });
    const ingestion = await testDb.db
      .insertInto("ingestion")
      .values({ source: "nuclei", createdAt: new Date(), createdBy: actorId })
      .returning("id")
      .executeTakeFirstOrThrow();
    expect(await sources.getByIngestionID(ingestion.id)).toBeNull();
    expect(await sources.getByIngestionID(actorId)).toBeNull();
    expect(source.ingestionId).toBeNull();
    // Submission is deferred; arrange the relationship without introducing a public linker.
    await testDb.db
      .updateTable("import_source")
      .set({ ingestionId: ingestion.id })
      .where("id", "=", source.id)
      .execute();
    const linked = await sources.getByIngestionID(ingestion.id);
    expect(linked).toEqual({ ...source, ingestionId: ingestion.id });
    expect(await sources.getByID(source.id)).toEqual(linked);
    expect(await buffer(await sources.readByID(linked!.id))).toEqual(Buffer.from("abc"));

    objects.clear();
    expect(await sources.getByIngestionID(ingestion.id)).toEqual(linked);
    await expect(sources.readByID(linked!.id)).rejects.toMatchObject({
      code: "import_source.read_failed",
    });
    await sources.deleteByID(source.id);
    const deleted = await sources.getByIngestionID(ingestion.id);
    expect(deleted).toEqual({
      ...linked,
      state: "deleted",
      deletedAt: expect.any(Date),
      cleanupState: "completed",
    });
    await sources.deleteByID(source.id);
    expect(await sources.getByIngestionID(ingestion.id)).toEqual(deleted);
    await expect(sources.readByID(deleted!.id)).rejects.toMatchObject({
      code: "import_source.not_available",
    });
  });

  it.each(["available", "incomplete", "deleted"] as const)(
    "preserves %s metadata and never accesses bytes through a differently bucketed handle",
    async (state) => {
      const sources = capability();
      failWrite = state === "incomplete";
      failDelete = state === "incomplete";
      const result = await sources
        .create({
          body: Readable.from([Buffer.from("abc")]),
          expectedSize: 3,
          originalFilename: "scan.jsonl",
          performedBy: actorId,
        })
        .catch((error: ApplicationError<"import_source.create_failed">) => ({
          id: error.details.sourceId,
        }));
      failDelete = false;
      if (state === "deleted") await sources.deleteByID(result.id);
      const ingestion = await testDb.db
        .insertInto("ingestion")
        .values({ source: "nuclei", createdAt: new Date(), createdBy: actorId })
        .returning("id")
        .executeTakeFirstOrThrow();
      await testDb.db
        .updateTable("import_source")
        .set({ ingestionId: ingestion.id })
        .where("id", "=", result.id)
        .execute();
      const source = await sources.getByID(result.id);
      expect(source).toMatchObject({ state, ingestionId: ingestion.id });
      const mismatched = capability({}, { ...storage, bucket: "other-input" });
      storage.write.mockClear();
      storage.read.mockClear();
      storage.delete.mockClear();

      expect(await mismatched.getByID(result.id)).toEqual(source);
      expect(await mismatched.getByIngestionID(ingestion.id)).toEqual(source);
      await expect(mismatched.readByID(result.id)).rejects.toMatchObject({
        code:
          state === "available" ? "import_source.bucket_mismatch" : "import_source.not_available",
        kind: "conflict",
        details: { sourceId: result.id },
      });
      if (state === "deleted") {
        await expect(mismatched.deleteByID(result.id)).resolves.toBeUndefined();
      } else {
        const error = await mismatched.deleteByID(result.id).catch((error: unknown) => error);
        expect(error).toMatchObject({ code: "import_source.bucket_mismatch", kind: "conflict" });
        expect((error as ApplicationError<"import_source.bucket_mismatch">).details).toEqual({
          sourceId: result.id,
        });
      }
      expect(await sources.getByID(result.id)).toEqual(source);
      expect(await mismatched.getByIngestionID(ingestion.id)).toEqual(source);
      expect(storage.write).not.toHaveBeenCalled();
      expect(storage.read).not.toHaveBeenCalled();
      expect(storage.delete).not.toHaveBeenCalled();
      expect(objects.size).toBe(state === "deleted" ? 0 : 1);
      if (state === "available") {
        expect(await buffer(await sources.readByID(result.id))).toEqual(Buffer.from("abc"));
      }
      await sources.deleteByID(result.id);
      expect(await sources.getByID(result.id)).toMatchObject({ state: "deleted" });
      expect(objects.size).toBe(0);
    },
  );

  it.each([
    { label: "short input", reason: "size_mismatch", actualSize: 2 },
    { label: "empty short input", reason: "size_mismatch", actualSize: 0 },
    { label: "overrun input", reason: "size_mismatch", actualSize: null },
    { label: "interrupted input", reason: "transfer_failed", actualSize: null },
  ] as const)(
    "maps storage's $label failure and size facts while keeping incomplete provenance",
    async ({ reason, actualSize }) => {
      const sources = capability();
      storage.write.mockImplementationOnce(async ({ body }) => {
        body.destroy();
        throw new ApplicationError({
          code: "object_storage.write_failed",
          kind: "unexpected",
          message: "private-storage-failure",
          details: { reason, actualSize },
        });
      });
      let sourceId = "";
      try {
        await sources.create({
          body: Readable.from([Buffer.from("abc")]),
          expectedSize: 3,
          originalFilename: "scan",
          performedBy: actorId,
        });
        expect.fail("mismatched input must fail");
      } catch (error) {
        expect(error).toMatchObject({
          code: "import_source.create_failed",
          details: {
            sourceId: expect.any(String),
            reason,
            cleanupState: "completed",
          },
        });
        sourceId = (error as { details: { sourceId: string } }).details.sourceId;
      }
      expect(await sources.getByID(sourceId)).toMatchObject({
        state: "incomplete",
        actualSize,
        availableAt: null,
        failedAt: expect.any(Date),
        cleanupState: "completed",
      });
      await expect(sources.readByID(sourceId)).rejects.toMatchObject({
        code: "import_source.not_available",
      });
      expect(objects.size).toBe(0);
    },
  );

  it.each(["storage", "finalization", "compensation", "bookkeeping"] as const)(
    "keeps %s failures unavailable and records truthful cleanup outcomes",
    async (failure) => {
      const sources = capability();
      failWrite = failure === "storage" || failure === "compensation";
      failDelete = failure === "compensation";
      if (failure === "finalization" || failure === "bookkeeping") {
        await sql`create function fail_import_source_update() returns trigger language plpgsql as $$
          begin raise exception 'injected metadata failure'; end;
        $$`.execute(testDb.db);
        if (failure === "finalization") {
          await sql`create trigger fail_import_source_update before update on import_source
            for each row when (new.state = 'available') execute function fail_import_source_update()`.execute(
            testDb.db,
          );
        } else {
          await sql`create trigger fail_import_source_update before update on import_source
            for each row execute function fail_import_source_update()`.execute(testDb.db);
        }
      }
      const body = Readable.from([Buffer.from("abc")], {
        autoDestroy: failure !== "finalization" && failure !== "bookkeeping",
      });
      const error = await sources
        .create({ body, expectedSize: 3, originalFilename: "scan", performedBy: actorId })
        .catch((error: unknown) => error);
      expect(error).toMatchObject({
        code: "import_source.create_failed",
        details: {
          sourceId: expect.any(String),
          cleanupState:
            failure === "bookkeeping"
              ? "pending"
              : failure === "compensation"
                ? "failed"
                : "completed",
          reason:
            failure === "finalization" || failure === "bookkeeping"
              ? "finalization_failed"
              : "transfer_failed",
        },
      });
      expect(JSON.stringify(error)).not.toContain("private-storage-failure");
      const id = (error as { details: { sourceId: string } }).details.sourceId;
      expect(await sources.getByID(id)).toMatchObject({
        state: "incomplete",
        actualSize: failure === "bookkeeping" ? null : 3,
        availableAt: null,
        cleanupState:
          failure === "bookkeeping"
            ? "pending"
            : failure === "compensation"
              ? "failed"
              : "completed",
        failedAt: failure === "bookkeeping" ? null : expect.any(Date),
      });
      await expect(sources.readByID(id)).rejects.toMatchObject({
        code: "import_source.not_available",
      });
      expect(objects.size).toBe(failure === "compensation" || failure === "bookkeeping" ? 1 : 0);
      expect(body.destroyed).toBe(true);
    },
  );

  it.each([true, false])(
    "handles a committed finalization with a lost response (bookkeeping unavailable: %s)",
    async (bookkeepingUnavailable) => {
      if (bookkeepingUnavailable) {
        await sql`create function fail_import_source_update() returns trigger language plpgsql as $$
        begin raise exception 'injected bookkeeping outage'; end;
      $$`.execute(testDb.db);
        await sql`create trigger fail_import_source_update before update on import_source
        for each row when (new.state = 'incomplete') execute function fail_import_source_update()`.execute(
          testDb.db,
        );
      }
      let sourceId = "";
      // A result plugin loses the response only after the real autocommit update succeeds.
      const database = testDb.db.withPlugin({
        transformQuery: ({ node }) => node,
        async transformResult({ result }) {
          const row = result.rows[0];
          if (!sourceId && row?.state === "available") {
            sourceId = row.id as string;
            throw new Error("finalization response lost after commit");
          }
          return result;
        },
      });
      const sources = createImportSources(
        createBackendRuntime({ database, logger: pino({ enabled: false }) }),
        storage,
      );
      const remove = storage.delete.getMockImplementation()!;
      let stateAtDelete: string | undefined;
      storage.delete.mockImplementation(async (key) => {
        stateAtDelete = (await sources.getByID(sourceId))?.state;
        await remove(key);
      });
      const error = await sources
        .create({
          body: Readable.from([Buffer.from("abc")]),
          expectedSize: 3,
          originalFilename: "scan",
          performedBy: actorId,
        })
        .catch((error: unknown) => error);
      expect(error).toMatchObject({
        code: "import_source.create_failed",
        details: {
          sourceId,
          reason: "finalization_failed",
          cleanupState: bookkeepingUnavailable ? "pending" : "completed",
        },
      });
      if (bookkeepingUnavailable) {
        expect(stateAtDelete).toBeUndefined();
        expect(objects.size).toBe(1);
        expect(await sources.getByID(sourceId)).toMatchObject({ state: "available" });
        expect(await buffer(await sources.readByID(sourceId))).toEqual(Buffer.from("abc"));
      } else {
        expect(stateAtDelete).toBe("incomplete");
        expect(objects.size).toBe(0);
        expect(await sources.getByID(sourceId)).toMatchObject({
          state: "incomplete",
          availableAt: null,
          cleanupState: "completed",
          failedAt: expect.any(Date),
        });
        await expect(sources.readByID(sourceId)).rejects.toMatchObject({
          code: "import_source.not_available",
        });
      }
    },
  );

  it("returns null for unknown metadata but typed errors for missing sources and unexpectedly missing objects", async () => {
    const sources = capability();
    expect(await sources.getByID(actorId)).toBeNull();
    await expect(sources.readByID(actorId)).rejects.toMatchObject({
      code: "import_source.not_found",
      kind: "missing",
    });
    const source = await sources.create({
      body: Readable.from([Buffer.from("a")]),
      expectedSize: 1,
      originalFilename: "scan",
      performedBy: actorId,
    });
    objects.clear();
    await expect(sources.readByID(source.id)).rejects.toMatchObject({
      code: "import_source.read_failed",
      kind: "unexpected",
    });
  });

  it("does not transfer bytes when reservation fails and wraps database lookup failures", async () => {
    const sources = capability();
    const body = Readable.from([Buffer.from("abc")]);
    await expect(
      sources.create({
        body,
        expectedSize: 3,
        originalFilename: "scan",
        performedBy: "00000000-0000-4000-8000-000000000000",
      }),
    ).rejects.toMatchObject({ code: "import_source.reserve_failed", kind: "unexpected" });
    expect(storage.write).not.toHaveBeenCalled();
    expect(body.destroyed).toBe(true);
    await expect(sources.getByID("invalid-uuid")).rejects.toMatchObject({
      code: "import_source.get_failed",
    });
    await expect(sources.getByIngestionID("invalid-uuid")).rejects.toMatchObject({
      code: "import_source.get_by_ingestion_failed",
      kind: "unexpected",
      details: { ingestionId: "invalid-uuid" },
    });
    await expect(sources.readByID("invalid-uuid")).rejects.toMatchObject({
      code: "import_source.get_failed",
    });
  });

  it.each(["destroy", "error", "close"])(
    "records failed creation when input emits %s while reservation is pending",
    async (event) => {
      const reserved = deferred();
      const released = deferred();
      let waiting = true;
      const database = testDb.db.withPlugin({
        transformQuery: ({ node }) => node,
        async transformResult({ result }) {
          if (waiting) {
            waiting = false;
            reserved.resolve();
            await released.promise;
          }
          return result;
        },
      });
      const sources = createImportSources(
        createBackendRuntime({ database, logger: pino({ enabled: false }) }),
        storage,
      );
      const body = new Readable({ read() {} });
      const result = sources.create({
        body,
        expectedSize: 1,
        originalFilename: "scan",
        performedBy: actorId,
      });
      try {
        await reserved.promise;
        expect(body.readableDidRead).toBe(false);
        expect(storage.write).not.toHaveBeenCalled();
        if (event === "error") body.emit("error", new Error("input disconnected"));
        else body.destroy(event === "destroy" ? new Error("input disconnected") : undefined);
        await setImmediate();
      } finally {
        released.resolve();
      }
      const error = await result.catch((error: unknown) => error);
      expect(error).toMatchObject({
        code: "import_source.create_failed",
        details: { reason: "transfer_failed", cleanupState: "completed" },
      });
      const { sourceId } = (error as ApplicationError<"import_source.create_failed">).details;
      expect(await sources.getByID(sourceId)).toMatchObject({
        state: "incomplete",
        actualSize: null,
        failedAt: expect.any(Date),
        cleanupState: "completed",
      });
      expect(body.destroyed).toBe(true);
      expect(storage.write).not.toHaveBeenCalled();
      expect(storage.delete).toHaveBeenCalledOnce();
    },
  );

  it("handles an asynchronous input error from destruction after reservation fails", async () => {
    const body = new Readable({
      read() {},
      destroy(_error, callback) {
        void setImmediate().then(() => callback(new Error("input teardown failed")));
      },
    });
    await expect(
      capability().create({
        body,
        expectedSize: 1,
        originalFilename: "scan",
        performedBy: "00000000-0000-4000-8000-000000000000",
      }),
    ).rejects.toMatchObject({ code: "import_source.reserve_failed" });
    await setImmediate();
    expect(body.destroyed).toBe(true);
    expect(storage.write).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("returns the read stream without consuming it and leaves late errors to its caller", async () => {
    const sources = capability();
    const source = await sources.create({
      body: Readable.from([Buffer.from("abc")]),
      expectedSize: 3,
      originalFilename: "scan",
      performedBy: actorId,
    });
    const body = new Readable({ read() {} });
    storage.read.mockResolvedValueOnce(body);
    const returned = await sources.readByID(source.id);
    expect(returned).toBe(body);
    expect(body.readableDidRead).toBe(false);
    const consumed = buffer(returned);
    body.destroy(new Error("read interrupted after return"));
    await expect(consumed).rejects.toThrow("read interrupted after return");
    expect(await sources.getByID(source.id)).toEqual(source);
  });

  it.each(["temporary", "keep"] as const)(
    "explicitly deletes %s bytes, preserves provenance, and permits repeated deletion",
    async (retentionPolicy) => {
      const sources = capability({ retentionPolicy });
      const source = await sources.create({
        body: Readable.from([Buffer.from("abc")]),
        expectedSize: 3,
        originalFilename: "scan.jsonl",
        performedBy: actorId,
      });
      await sources.deleteByID(source.id);
      expect(objects.size).toBe(0);
      const deleted = await sources.getByID(source.id);
      expect(deleted).toEqual({
        ...source,
        state: "deleted",
        deletedAt: expect.any(Date),
        cleanupState: "completed",
      });
      await sources.deleteByID(source.id);
      expect(await sources.getByID(source.id)).toEqual(deleted);
      storage.read.mockClear();
      await expect(sources.readByID(source.id)).rejects.toMatchObject({
        code: "import_source.not_available",
        kind: "conflict",
      });
      expect(storage.read).not.toHaveBeenCalled();
    },
  );

  it("preserves the first deletion timestamp when deletion calls overlap", async () => {
    const sources = capability();
    const source = await sources.create({
      body: Readable.from([Buffer.from("abc")]),
      expectedSize: 3,
      originalFilename: "scan",
      performedBy: actorId,
    });
    let signalBothDeleting!: () => void;
    const bothDeleting = new Promise<void>((resolve) => {
      signalBothDeleting = resolve;
    });
    let releaseSecond!: () => void;
    const secondReleased = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    const remove = storage.delete.getMockImplementation()!;
    let deletions = 0;
    storage.delete.mockImplementation(async (key) => {
      deletions += 1;
      if (deletions === 1) {
        await bothDeleting;
      } else {
        signalBothDeleting();
        await secondReleased;
      }
      await remove(key);
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-09-13T00:00:00Z"));
      const first = sources.deleteByID(source.id);
      const second = sources.deleteByID(source.id);
      await first;
      const deleted = await sources.getByID(source.id);
      expect(deleted?.deletedAt).toEqual(new Date("2026-09-13T00:00:00Z"));
      vi.setSystemTime(new Date("2026-09-13T00:00:01Z"));
      releaseSecond();
      await second;
      expect(await sources.getByID(source.id)).toEqual(deleted);
      expect(objects.size).toBe(0);
    } finally {
      releaseSecond();
      vi.useRealTimers();
    }
  });

  it("distinguishes missing source records from known sources with absent objects", async () => {
    const sources = capability();
    await expect(sources.deleteByID(actorId)).rejects.toMatchObject({
      code: "import_source.not_found",
      kind: "missing",
      details: { sourceId: actorId },
    });
    await expect(sources.deleteByID("invalid-uuid")).rejects.toMatchObject({
      code: "import_source.get_failed",
      kind: "unexpected",
    });
    expect(storage.delete).not.toHaveBeenCalled();
    const source = await sources.create({
      body: Readable.from([Buffer.from("abc")]),
      expectedSize: 3,
      originalFilename: "scan",
      performedBy: actorId,
    });
    objects.clear();
    await expect(sources.readByID(source.id)).rejects.toMatchObject({
      code: "import_source.read_failed",
    });
    await sources.deleteByID(source.id);
    expect(await sources.getByID(source.id)).toEqual({
      ...source,
      state: "deleted",
      deletedAt: expect.any(Date),
      cleanupState: "completed",
    });
  });

  it.each(["storage", "bookkeeping"])(
    "reports %s deletion failure truthfully and permits retry",
    async (failure) => {
      const sources = capability();
      const source = await sources.create({
        body: Readable.from([Buffer.from("abc")]),
        expectedSize: 3,
        originalFilename: "scan",
        performedBy: actorId,
      });
      if (failure === "bookkeeping") {
        await sql`create function fail_import_source_update() returns trigger language plpgsql as $$
          begin raise exception 'injected metadata failure'; end;
        $$`.execute(testDb.db);
        await sql`create trigger fail_import_source_update before update on import_source
          for each row execute function fail_import_source_update()`.execute(testDb.db);
      } else {
        storage.delete.mockRejectedValueOnce(
          new ApplicationError({
            code: "object_storage.delete_failed",
            kind: "unexpected",
            message: "private-storage-failure",
          }),
        );
      }
      const error = await sources.deleteByID(source.id).catch((error: unknown) => error);
      expect(error).toMatchObject({
        code: "import_source.delete_failed",
        kind: "unexpected",
        details: {
          sourceId: source.id,
          reason: failure === "bookkeeping" ? "bookkeeping_failed" : "storage_failed",
        },
      });
      expect(JSON.stringify(error)).not.toContain("private-storage-failure");
      expect(await sources.getByID(source.id)).toEqual(source);
      expect(objects.size).toBe(failure === "bookkeeping" ? 0 : 1);
      if (failure === "bookkeeping") {
        await expect(sources.readByID(source.id)).rejects.toMatchObject({
          code: "import_source.read_failed",
        });
        await sql`drop trigger fail_import_source_update on import_source`.execute(testDb.db);
      } else {
        expect(await buffer(await sources.readByID(source.id))).toEqual(Buffer.from("abc"));
      }
      await sources.deleteByID(source.id);
      expect(objects.size).toBe(0);
      expect(await sources.getByID(source.id)).toEqual({
        ...source,
        state: "deleted",
        deletedAt: expect.any(Date),
        cleanupState: "completed",
      });
    },
  );

  it("explicitly cleans failed creation without losing incomplete provenance", async () => {
    const sources = capability();
    failWrite = true;
    failDelete = true;
    const error = await sources
      .create({
        body: Readable.from([Buffer.from("abc")]),
        expectedSize: 3,
        originalFilename: "scan",
        performedBy: actorId,
      })
      .catch((error: unknown) => error);
    const { sourceId } = (error as { details: { sourceId: string } }).details;
    const incomplete = await sources.getByID(sourceId);
    expect(incomplete).toMatchObject({ state: "incomplete", cleanupState: "failed" });
    failDelete = false;
    await sources.deleteByID(sourceId);
    expect(objects.size).toBe(0);
    expect(await sources.getByID(sourceId)).toEqual({
      ...incomplete,
      state: "deleted",
      deletedAt: expect.any(Date),
      cleanupState: "completed",
    });
    await expect(sources.readByID(sourceId)).rejects.toMatchObject({
      code: "import_source.not_available",
    });
  });
});
