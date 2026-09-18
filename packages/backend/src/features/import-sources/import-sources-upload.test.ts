import { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import { setImmediate } from "node:timers/promises";

import { sql } from "kysely";
import { pino } from "pino";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDatabase } from "../../database/test/database.js";
import { ApplicationError, createBackendRuntime } from "../../index.js";
import { createImportSources } from "./index.js";

import type { ObjectStorage } from "../../object-storage/index.js";
import type { ImportSourcesConfiguration, UploadImportSourceCommand } from "./index.js";

const actorId = "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f";
const registration = {
  source: "example-scanner" as const,
  originalFilename: "../../scan.jsonl",
  mimeType: "unverified metadata",
  sizeBytes: 3,
  performedBy: actorId,
};

function command(importSourceId: string): UploadImportSourceCommand {
  return {
    importSourceId,
    performedBy: actorId,
    body: Readable.from([Buffer.from("abc")]),
    signal: new AbortController().signal,
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("registered import-source uploads", () => {
  const testDb = createTestDatabase();
  const objects = new Map<string, Buffer>();
  const storage = {
    bucket: "private-input",
    write: vi.fn<ObjectStorage["write"]>(),
    read: vi.fn<ObjectStorage["read"]>(),
    delete: vi.fn<ObjectStorage["delete"]>(),
    close: vi.fn<ObjectStorage["close"]>(),
  } satisfies ObjectStorage;

  beforeAll(async () => {
    await testDb.start();
    await testDb.db
      .insertInto("user_profile")
      .values({
        id: actorId,
        username: "upload-creator",
        email: "upload-creator@example.test",
        displayName: "Upload creator",
        enabled: true,
        passwordHash: "unused",
      })
      .execute();
  });
  afterAll(async () => await testDb.dispose());
  beforeEach(() => {
    objects.clear();
    storage.write.mockReset().mockImplementation(async ({ key, body, expectedSizeBytes }) => {
      const bytes = await buffer(body);
      if (bytes.byteLength !== expectedSizeBytes) {
        throw new ApplicationError({
          code: "object_storage.write_failed",
          kind: "unexpected",
          message: "Input size differs from the declared length",
          details: { reason: "size_mismatch", actualSize: bytes.byteLength },
        });
      }
      objects.set(key, bytes);
    });
    storage.read.mockReset().mockImplementation(async (key) => {
      const bytes = objects.get(key);
      if (!bytes) throw new Error("Object not found");
      return Readable.from([bytes]);
    });
    storage.delete.mockReset().mockImplementation(async (key) => {
      objects.delete(key);
    });
    storage.close.mockReset();
  });
  afterEach(async () => {
    storage.close();
    vi.restoreAllMocks();
    await sql`drop trigger if exists fail_upload_update on import_source`.execute(testDb.db);
    await sql`drop function if exists fail_upload_update()`.execute(testDb.db);
  });

  function capability(configuration: ImportSourcesConfiguration = {}, database = testDb.db) {
    return createImportSources(
      createBackendRuntime({ database, logger: pino({ enabled: false }) }),
      storage,
      configuration,
    );
  }

  it("claims once before streaming and preserves registered metadata across configuration changes", async () => {
    const registered = await capability({ retentionPolicy: "keep" }).register(registration);
    expect(registered.uploadStartedAt).toBeNull();
    const sources = capability({ retentionPolicy: "temporary" });
    const write = storage.write.getMockImplementation()!;
    storage.write.mockImplementationOnce(async (input) => {
      expect(await capability().getByID(registered.id)).toEqual({
        ...registered,
        uploadStartedAt: expect.any(Date),
      });
      expect(input.expectedSizeBytes).toBe(3);
      await write(input);
    });
    const controller = new AbortController();
    const uploaded = await sources.upload({
      ...command(registered.id),
      contentLength: 3,
      signal: controller.signal,
    });
    expect(uploaded).toEqual({
      ...registered,
      uploadStartedAt: expect.any(Date),
      state: "available",
      availableAt: expect.any(Date),
      cleanupRequired: false,
    });
    controller.abort();
    expect(await sources.getByID(uploaded.id)).toEqual(uploaded);
    expect(await buffer(await sources.readByID(uploaded.id))).toEqual(Buffer.from("abc"));
    expect(await testDb.db.selectFrom("ingestion").selectAll().execute()).toEqual([]);
    expect(await testDb.db.selectFrom("job").selectAll().execute()).toEqual([]);
    expect(storage.delete).not.toHaveBeenCalled();
    expect([...objects.keys()]).toEqual([expect.stringMatching(/^import-sources\/[\da-f-]+$/u)]);
  });

  it.each([
    { sizeBytes: 0, contentLength: undefined },
    { sizeBytes: 0, contentLength: 0 },
    { sizeBytes: 3, contentLength: undefined },
    { sizeBytes: 3, contentLength: 3 },
  ])(
    "accepts exact $sizeBytes bytes with content length $contentLength",
    async ({ sizeBytes, contentLength }) => {
      const sources = capability({ maxSizeBytes: sizeBytes });
      const source = await sources.register({ ...registration, sizeBytes });
      const body = Readable.from(sizeBytes === 0 ? [] : [Buffer.from("ab"), Buffer.from("c")]);
      await expect(
        sources.upload({ ...command(source.id), body, contentLength }),
      ).resolves.toMatchObject({
        state: "available",
        sizeBytes,
        uploadStartedAt: expect.any(Date),
      });
      expect(await buffer(await sources.readByID(source.id))).toEqual(
        Buffer.from(sizeBytes ? "abc" : ""),
      );
    },
  );

  it("validates IDs, actor, readable input, optional size header, signal, and metadata overrides before lookup", async () => {
    const queried = vi.fn();
    const sources = capability(
      {},
      testDb.db.withPlugin({
        transformQuery({ node }) {
          queried();
          return node;
        },
        async transformResult({ result }) {
          return result;
        },
      }),
    );
    const valid = command(actorId);
    const destroyed = new Readable({ read() {} });
    destroyed.destroy();
    const exhausted = Readable.from([]);
    await buffer(exhausted);
    try {
      for (const invalid of [
        null,
        undefined,
        [],
        { ...valid, importSourceId: undefined },
        { ...valid, importSourceId: "not-a-uuid" },
        { ...valid, performedBy: undefined },
        { ...valid, performedBy: "not-a-uuid" },
        ...[undefined, null, {}, Buffer.from("abc"), destroyed, exhausted].map((body) => ({
          ...valid,
          body,
        })),
        ...[null, "3", -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map(
          (contentLength) => ({ ...valid, contentLength }),
        ),
        ...[undefined, null, {}, { aborted: false }].map((signal) => ({ ...valid, signal })),
        { ...valid, sizeBytes: 0 },
        { ...valid, source: "example-scanner" },
        { ...valid, originalFilename: "replacement" },
        { ...valid, retentionPolicy: "keep" },
      ]) {
        await expect(sources.upload(invalid as never)).rejects.toMatchObject({
          code: "import_source.invalid_input",
          kind: "validation",
        });
      }
      expect(queried).not.toHaveBeenCalled();
      expect(storage.write).not.toHaveBeenCalled();
      expect(storage.read).not.toHaveBeenCalled();
      expect(storage.delete).not.toHaveBeenCalled();
      expect(valid.body.readableDidRead).toBe(false);
    } finally {
      valid.body.destroy();
    }
  });

  it("rejects unknown sources and non-creators without claiming or accessing bytes", async () => {
    const sources = capability();
    const source = await sources.register(registration);
    for (const [input, code, kind] of [
      [command(actorId), "import_source.not_found", "missing"],
      [
        { ...command(source.id), performedBy: "00000000-0000-4000-8000-000000000000" },
        "import_source.upload_forbidden",
        "denied",
      ],
    ] as const) {
      await expect(sources.upload(input)).rejects.toMatchObject({ code, kind });
      expect(input.body.readableDidRead).toBe(false);
    }
    expect(storage.write).not.toHaveBeenCalled();
    expect(storage.read).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
    expect(await sources.getByID(source.id)).toEqual(source);
    await expect(sources.upload(command(source.id))).resolves.toMatchObject({ state: "available" });
  });

  it("rejects mismatched headers and current size limits before claiming, without consuming the registration", async () => {
    const sources = capability();
    const source = await sources.register(registration);
    for (const contentLength of [0, 2, 4, 104857601]) {
      const input = { ...command(source.id), contentLength };
      await expect(sources.upload(input)).rejects.toMatchObject({
        code: "import_source.invalid_input",
      });
      expect(input.body.readableDidRead).toBe(false);
    }
    await expect(capability({ maxSizeBytes: 2 }).upload(command(source.id))).rejects.toMatchObject({
      code: "import_source.invalid_input",
    });
    const oversized = await capability({ maxSizeBytes: 104857601 }).register({
      ...registration,
      sizeBytes: 104857601,
    });
    await expect(sources.upload(command(oversized.id))).rejects.toMatchObject({
      code: "import_source.invalid_input",
    });
    expect(await sources.getByID(oversized.id)).toEqual(oversized);
    expect(await sources.getByID(source.id)).toEqual(source);
    expect(storage.write).not.toHaveBeenCalled();
    expect(storage.read).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
    await expect(sources.upload(command(source.id))).resolves.toMatchObject({ state: "available" });
  });

  it("uses the registered bucket without consuming an attempt through a mismatched handle", async () => {
    const sources = capability();
    const source = await sources.register(registration);
    const other = createImportSources(
      createBackendRuntime({ database: testDb.db, logger: pino({ enabled: false }) }),
      { ...storage, bucket: "another-bucket" },
    );
    await expect(other.upload(command(source.id))).rejects.toMatchObject({
      code: "import_source.bucket_mismatch",
    });
    expect(await sources.getByID(source.id)).toEqual(source);
    expect(storage.write).not.toHaveBeenCalled();
    expect(storage.read).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it.each(["ab", "abcd", ""])(
    "compensates an exact-size mismatch (%j) without reopening the attempt",
    async (bytes) => {
      const sources = capability();
      const source = await sources.register(registration);
      await expect(
        sources.upload({ ...command(source.id), body: Readable.from([Buffer.from(bytes)]) }),
      ).rejects.toMatchObject({
        code: "import_source.create_failed",
        details: { sourceId: source.id, reason: "size_mismatch", cleanupRequired: false },
      });
      expect(await sources.getByID(source.id)).toMatchObject({
        state: "incomplete",
        sizeBytes: 3,
        availableAt: null,
        uploadStartedAt: expect.any(Date),
        failedAt: expect.any(Date),
        cleanupRequired: false,
      });
      await expect(sources.readByID(source.id)).rejects.toMatchObject({
        code: "import_source.not_available",
      });
      await expect(capability().upload(command(source.id))).rejects.toMatchObject({
        code: "import_source.upload_already_attempted",
      });
      expect(storage.write).toHaveBeenCalledOnce();
      expect(storage.delete).toHaveBeenCalledOnce();
      expect(objects.size).toBe(0);
    },
  );

  it.each(["success", "failure"])(
    "atomically admits only one concurrent upload after both read unused metadata (%s)",
    async (outcome) => {
      const source = await capability().register(registration);
      const read = deferred();
      const writing = deferred();
      const released = deferred();
      let readers = 0;
      const sources = capability(
        {},
        testDb.db.withPlugin({
          transformQuery: ({ node }) => node,
          async transformResult({ result }) {
            if (result.rows[0]?.id === source.id && result.rows[0]?.uploadStartedAt === null) {
              readers += 1;
              if (readers === 2) read.resolve();
              await read.promise;
            }
            return result;
          },
        }),
      );
      const write = storage.write.getMockImplementation()!;
      storage.write.mockImplementation(async (input) => {
        await write(input);
        writing.resolve();
        await released.promise;
        if (outcome === "failure") throw new Error("transfer failed after bytes arrived");
      });
      const first = sources.upload(command(source.id));
      const second = sources.upload(command(source.id));
      const loser = Promise.race([first, second]).catch((error: unknown) => error);
      try {
        await writing.promise;
        expect(await loser).toMatchObject({
          code: "import_source.upload_already_attempted",
          kind: "conflict",
        });
        await expect(
          capability().upload({ ...command(source.id), contentLength: 2 }),
        ).rejects.toMatchObject({
          code: "import_source.upload_already_attempted",
          kind: "conflict",
        });
        expect(readers).toBe(2);
        expect(storage.write).toHaveBeenCalledOnce();
        expect(storage.delete).not.toHaveBeenCalled();
        expect(objects.size).toBe(1);
        expect(await capability().getByID(source.id)).toMatchObject({
          state: "incomplete",
          uploadStartedAt: expect.any(Date),
        });
      } finally {
        released.resolve();
        await Promise.allSettled([first, second]);
      }
      expect(storage.write).toHaveBeenCalledOnce();
      expect(storage.delete).toHaveBeenCalledTimes(outcome === "success" ? 0 : 1);
      expect(objects.size).toBe(outcome === "success" ? 1 : 0);
      const completed = await capability().getByID(source.id);
      for (const contentLength of [undefined, 3, 2]) {
        for (const maxSizeBytes of [3, 2]) {
          await expect(
            capability({ maxSizeBytes }).upload({ ...command(source.id), contentLength }),
          ).rejects.toMatchObject({
            code: "import_source.upload_already_attempted",
            kind: "conflict",
          });
        }
      }
      expect(await capability().getByID(source.id)).toEqual(completed);
      expect(storage.write).toHaveBeenCalledOnce();
      expect(storage.delete).toHaveBeenCalledTimes(outcome === "success" ? 0 : 1);
    },
  );

  it.each([
    { state: "available" as const, availableAt: new Date(), cleanupRequired: false },
    { failedAt: new Date() },
    { state: "deleted" as const, deletedAt: new Date(), cleanupRequired: false },
    { source: null },
    { availableAt: new Date() },
    { deletedAt: new Date() },
  ])(
    "never reopens historical or non-registration metadata even with a null marker: %j",
    async (metadata) => {
      const sources = capability();
      const source = await sources.register(registration);
      await testDb.db
        .updateTable("import_source")
        .set(metadata)
        .where("id", "=", source.id)
        .execute();
      const before = await sources.getByID(source.id);
      await expect(sources.upload(command(source.id))).rejects.toMatchObject({
        code: "import_source.upload_already_attempted",
        kind: "conflict",
      });
      expect(await sources.getByID(source.id)).toEqual(before);
      expect(storage.write).not.toHaveBeenCalled();
      expect(storage.read).not.toHaveBeenCalled();
      expect(storage.delete).not.toHaveBeenCalled();
    },
  );

  it.each(["before lookup", "during lookup", "during claim"])(
    "stops cancellation %s without reusing a consumed attempt",
    async (stage) => {
      const source = await capability().register(registration);
      const controller = new AbortController();
      const input = { ...command(source.id), signal: controller.signal };
      const database = testDb.db.withPlugin({
        transformQuery: ({ node }) => node,
        async transformResult({ result }) {
          const row = result.rows[0];
          if (
            row?.id === source.id &&
            (stage === "during lookup" || (stage === "during claim" && row.uploadStartedAt))
          ) {
            controller.abort();
          }
          return result;
        },
      });
      if (stage === "before lookup") controller.abort();
      await expect(capability({}, database).upload(input)).rejects.toMatchObject({
        name: "ApplicationError",
        code:
          stage === "during claim"
            ? "import_source.create_failed"
            : "import_source.upload_cancelled",
        kind: stage === "during claim" ? "unexpected" : "conflict",
        message:
          stage === "during claim"
            ? "Import source creation failed"
            : "Import source upload was cancelled",
        details: { sourceId: source.id },
        cause: undefined,
      });
      expect(input.body.destroyed).toBe(true);
      expect(storage.write).not.toHaveBeenCalled();
      if (stage === "during claim") {
        expect(await capability().getByID(source.id)).toMatchObject({
          uploadStartedAt: expect.any(Date),
          failedAt: expect.any(Date),
        });
        await expect(capability().upload(command(source.id))).rejects.toMatchObject({
          code: "import_source.upload_already_attempted",
        });
      } else {
        expect(storage.read).not.toHaveBeenCalled();
        expect(storage.delete).not.toHaveBeenCalled();
        expect(await capability().getByID(source.id)).toEqual(source);
        await expect(capability().upload(command(source.id))).resolves.toMatchObject({
          state: "available",
        });
      }
    },
  );

  it("preserves an interrupted claim with a lost database response without touching bytes", async () => {
    const source = await capability().register(registration);
    const sources = capability(
      {},
      testDb.db.withPlugin({
        transformQuery: ({ node }) => node,
        async transformResult({ result }) {
          if (result.rows[0]?.id === source.id && result.rows[0]?.uploadStartedAt) {
            throw new Error("process interrupted after durable claim");
          }
          return result;
        },
      }),
    );
    await expect(sources.upload(command(source.id))).rejects.toMatchObject({
      code: "import_source.claim_failed",
    });
    expect(await capability().getByID(source.id)).toMatchObject({
      state: "incomplete",
      uploadStartedAt: expect.any(Date),
      failedAt: null,
    });
    await expect(capability().upload(command(source.id))).rejects.toMatchObject({
      code: "import_source.upload_already_attempted",
    });
    expect(storage.write).not.toHaveBeenCalled();
    expect(storage.read).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("waits for a cancelled storage write to settle before compensating the consumed attempt", async () => {
    const sources = capability();
    const source = await sources.register(registration);
    const ready = deferred();
    const released = deferred();
    const write = storage.write.getMockImplementation()!;
    storage.write.mockImplementationOnce(async (input) => {
      await write(input);
      ready.resolve();
      await released.promise;
      input.signal?.throwIfAborted();
    });
    const controller = new AbortController();
    const result = sources.upload({ ...command(source.id), signal: controller.signal });
    const settled = vi.fn();
    void result.then(settled, settled);
    try {
      await ready.promise;
      controller.abort();
      await setImmediate();
      expect(storage.write.mock.calls[0]![0].signal).toBe(controller.signal);
      expect(settled).not.toHaveBeenCalled();
      expect(storage.delete).not.toHaveBeenCalled();
      expect(objects.size).toBe(1);
      expect(await sources.getByID(source.id)).toMatchObject({
        state: "incomplete",
        uploadStartedAt: expect.any(Date),
        failedAt: null,
      });
      await expect(capability().upload(command(source.id))).rejects.toMatchObject({
        code: "import_source.upload_already_attempted",
      });
    } finally {
      released.resolve();
      await result.catch(() => {});
    }
    await expect(result).rejects.toMatchObject({
      code: "import_source.create_failed",
      details: { reason: "transfer_failed", cleanupRequired: false },
    });
    expect(await sources.getByID(source.id)).toMatchObject({
      state: "incomplete",
      uploadStartedAt: expect.any(Date),
      failedAt: expect.any(Date),
    });
    expect(storage.write).toHaveBeenCalledOnce();
    expect(storage.delete).toHaveBeenCalledExactlyOnceWith(storage.write.mock.calls[0]![0].key);
    expect(objects.size).toBe(0);
  });

  it("consumes an interrupted byte stream exactly once and never advertises it as available", async () => {
    const sources = capability();
    const source = await sources.register(registration);
    const body = Readable.from(
      (async function* () {
        yield Buffer.from("a");
        throw new Error("request disconnected");
      })(),
    );
    await expect(sources.upload({ ...command(source.id), body })).rejects.toMatchObject({
      code: "import_source.create_failed",
      details: { reason: "transfer_failed", cleanupRequired: false },
    });
    expect(await sources.getByID(source.id)).toMatchObject({
      state: "incomplete",
      availableAt: null,
      uploadStartedAt: expect.any(Date),
      failedAt: expect.any(Date),
    });
    await expect(capability().upload(command(source.id))).rejects.toMatchObject({
      code: "import_source.upload_already_attempted",
    });
    expect(body.destroyed).toBe(true);
    expect(objects.size).toBe(0);
    expect(storage.write).toHaveBeenCalledOnce();
    expect(storage.delete).toHaveBeenCalledOnce();
  });

  it("does not compensate cancellation after finalization has begun and returns its durable result", async () => {
    const source = await capability().register(registration);
    const finalized = deferred();
    const released = deferred();
    const sources = capability(
      {},
      testDb.db.withPlugin({
        transformQuery: ({ node }) => node,
        async transformResult({ result }) {
          if (result.rows[0]?.state === "available") {
            finalized.resolve();
            await released.promise;
          }
          return result;
        },
      }),
    );
    const controller = new AbortController();
    const result = sources.upload({ ...command(source.id), signal: controller.signal });
    try {
      await finalized.promise;
      controller.abort();
    } finally {
      released.resolve();
    }
    await expect(result).resolves.toMatchObject({ state: "available" });
    expect(await capability().getByID(source.id)).toMatchObject({
      state: "available",
      failedAt: null,
    });
    expect(objects.size).toBe(1);
    expect(storage.write).toHaveBeenCalledOnce();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it.each(["cleanup", "bookkeeping", "finalization"])(
    "preserves one-shot ownership and truthful cleanup when %s is uncertain",
    async (failure) => {
      const source = await capability().register(registration);
      if (failure !== "cleanup") {
        await sql`create function fail_upload_update() returns trigger language plpgsql as $$
        begin raise exception 'bookkeeping unavailable'; end;
      $$`.execute(testDb.db);
        await sql`create trigger fail_upload_update before update on import_source
        for each row when (new."failedAt" is not null) execute function fail_upload_update()`.execute(
          testDb.db,
        );
      }
      if (failure === "cleanup") storage.delete.mockRejectedValue(new Error("delete unavailable"));
      if (failure !== "finalization") {
        const write = storage.write.getMockImplementation()!;
        storage.write.mockImplementationOnce(async (input) => {
          await write(input);
          throw new Error("storage response lost");
        });
      }
      const sources = capability(
        {},
        testDb.db.withPlugin({
          transformQuery: ({ node }) => node,
          async transformResult({ result }) {
            if (failure === "finalization" && result.rows[0]?.state === "available") {
              throw new Error("finalization response lost after commit");
            }
            return result;
          },
        }),
      );
      await expect(sources.upload(command(source.id))).rejects.toMatchObject({
        code: "import_source.create_failed",
        details: { sourceId: source.id, cleanupRequired: failure !== "bookkeeping" },
      });
      const stored = await capability().getByID(source.id);
      expect(stored).toMatchObject({
        uploadStartedAt: expect.any(Date),
        state: failure === "finalization" ? "available" : "incomplete",
      });
      if (failure === "finalization") {
        expect(storage.write).toHaveBeenCalledOnce();
        expect(storage.delete).not.toHaveBeenCalled();
        expect(await buffer(await capability().readByID(source.id))).toEqual(Buffer.from("abc"));
      }
      expect(objects.size).toBe(failure === "bookkeeping" ? 0 : 1);
      await expect(capability().upload(command(source.id))).rejects.toMatchObject({
        code: "import_source.upload_already_attempted",
      });
      expect(await capability().getByID(source.id)).toEqual(stored);
    },
  );
});
