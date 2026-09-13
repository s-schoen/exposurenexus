import { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { sql } from "kysely";
import { pino } from "pino";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

import { createTestDatabase } from "../../database/test/database.js";
import { createBackendRuntime } from "../../index.js";
import { createImportSources, type ImportSourcesConfiguration } from "./index.js";

const actorId = "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f";
const configuration = {
  bucket: "private-input",
  region: "us-east-1",
  credentials: { accessKeyId: "test", secretAccessKey: "secret-not-for-results" },
};

describe("import sources", () => {
  const testDb = createTestDatabase();
  const objects = new Map<string, Buffer>();
  let failPut = false;
  let failDelete = false;
  let send: MockInstance<S3Client["send"]>;

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
    vi.restoreAllMocks();
    await sql`drop trigger if exists fail_import_source_update on import_source`.execute(testDb.db);
    await sql`drop function if exists fail_import_source_update()`.execute(testDb.db);
  });
  beforeEach(() => {
    objects.clear();
    failPut = false;
    failDelete = false;
    send = vi.spyOn(S3Client.prototype, "send").mockImplementation(async (command) => {
      if (command instanceof PutObjectCommand) {
        objects.set(command.input.Key!, await buffer(command.input.Body as Readable));
        if (failPut)
          throw new Error("storage error containing credentials: secret-not-for-results");
        return {};
      }
      if (command instanceof GetObjectCommand) {
        const bytes = objects.get(command.input.Key!);
        if (!bytes) throw new Error("NoSuchKey");
        return { Body: Readable.from([bytes]) };
      }
      if (command instanceof DeleteObjectCommand) {
        if (failDelete) throw new Error("cleanup unavailable");
        objects.delete(command.input.Key!);
        return {};
      }
      throw new Error("Unexpected S3 operation");
    });
  });

  function capability(overrides: Partial<ImportSourcesConfiguration> = {}) {
    return createImportSources(
      createBackendRuntime({
        database: testDb.db,
        logger: pino({ enabled: false }),
      }),
      { ...configuration, ...overrides },
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
      expect(send).not.toHaveBeenCalled();
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

  it("snapshots retention independently of subsequent capability configuration and accepts exact-limit and empty input", async () => {
    const runtime = createBackendRuntime({ database: testDb.db, logger: pino({ enabled: false }) });
    const config: ImportSourcesConfiguration = { ...configuration, maxSizeBytes: 4 };
    const temporary = createImportSources(runtime, config);
    const first = await temporary.create({
      body: Readable.from([Buffer.from("1234")]),
      expectedSize: 4,
      originalFilename: "scan",
      performedBy: actorId,
    });
    config.retentionPolicy = "keep";
    const retained = createImportSources(runtime, config);
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
    temporary.close();
    retained.close();
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
      expect(send).not.toHaveBeenCalled();
      body.destroy();
      sources.close();
    },
  );

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
    sources.close();
  });

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
    sources.close();
  });

  it.each([
    { label: "short", chunks: ["ab"], expectedSize: 3, maxSizeBytes: 4, actualSize: 2 },
    { label: "long", chunks: ["ab", "cd"], expectedSize: 3, maxSizeBytes: 8, actualSize: null },
    {
      label: "in-flight limit overrun",
      chunks: ["ab", "cdef"],
      expectedSize: 4,
      maxSizeBytes: 4,
      actualSize: null,
    },
  ])(
    "rejects $label input, cleans bytes and keeps incomplete provenance",
    async ({ chunks, expectedSize, maxSizeBytes, actualSize }) => {
      const sources = capability({ maxSizeBytes });
      let sourceId = "";
      try {
        await sources.create({
          body: Readable.from(chunks.map((chunk) => Buffer.from(chunk))),
          expectedSize,
          originalFilename: "scan",
          performedBy: actorId,
        });
        expect.fail("mismatched input must fail");
      } catch (error) {
        expect(error).toMatchObject({
          code: "import_source.create_failed",
          details: {
            sourceId: expect.any(String),
            reason: "size_mismatch",
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
      sources.close();
    },
  );

  it.each(["stream", "storage", "finalization", "compensation", "bookkeeping"] as const)(
    "keeps %s failures unavailable and records truthful cleanup outcomes",
    async (failure) => {
      const sources = capability();
      failPut = failure === "storage" || failure === "compensation";
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
      const body =
        failure === "stream"
          ? Readable.from(
              (async function* () {
                yield Buffer.from("a");
                throw new Error("interrupted stream");
              })(),
            )
          : Readable.from([Buffer.from("abc")]);
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
      expect(JSON.stringify(error)).not.toContain("secret-not-for-results");
      const id = (error as { details: { sourceId: string } }).details.sourceId;
      expect(await sources.getByID(id)).toMatchObject({
        state: "incomplete",
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
      sources.close();
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
        configuration,
      );
      const storage = send.getMockImplementation()!;
      let stateAtDelete: string | undefined;
      send.mockImplementation(async (...args) => {
        const [command] = args;
        if (command instanceof DeleteObjectCommand)
          stateAtDelete = (await sources.getByID(sourceId))?.state;
        return storage(...args);
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
      sources.close();
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
    sources.close();
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
    expect(send).not.toHaveBeenCalled();
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
    sources.close();
  });

  it("aborts a blocked input when storage fails before reading it", async () => {
    send.mockRejectedValueOnce(new Error("storage unavailable"));
    const body = new Readable({ read() {} });
    const sources = capability();
    await expect(
      sources.create({ body, expectedSize: 1, originalFilename: "scan", performedBy: actorId }),
    ).rejects.toMatchObject({
      code: "import_source.create_failed",
      details: { reason: "transfer_failed", cleanupState: "completed" },
    });
    expect(body.destroyed).toBe(true);
    sources.close();
  });

  it("rejects non-byte stream chunks without leaking an unhandled stream error", async () => {
    const sources = capability();
    await expect(
      sources.create({
        body: Readable.from([{ not: "bytes" }]),
        expectedSize: 1,
        originalFilename: "scan",
        performedBy: actorId,
      }),
    ).rejects.toMatchObject({
      code: "import_source.create_failed",
      details: { reason: "transfer_failed", cleanupState: "completed" },
    });
    sources.close();
  });

  it("handles input errors during database reservation and premature stream closure", async () => {
    const sources = capability();
    const body = new Readable({ read() {} });
    const result = sources.create({
      body,
      expectedSize: 1,
      originalFilename: "scan",
      performedBy: actorId,
    });
    body.destroy(new Error("input disconnected during reservation"));
    await expect(result).rejects.toMatchObject({
      code: "import_source.create_failed",
      details: { reason: "transfer_failed" },
    });
    const interrupted = new Readable({
      read() {
        this.push(Buffer.from("a"));
        this.destroy();
      },
    });
    await expect(
      sources.create({
        body: interrupted,
        expectedSize: 1,
        originalFilename: "scan",
        performedBy: actorId,
      }),
    ).rejects.toMatchObject({
      code: "import_source.create_failed",
      details: { reason: "transfer_failed" },
    });
    sources.close();
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
      send.mockClear();
      await expect(sources.readByID(source.id)).rejects.toMatchObject({
        code: "import_source.not_available",
        kind: "conflict",
      });
      expect(send).not.toHaveBeenCalled();
      sources.close();
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
    const storage = send.getMockImplementation()!;
    let deletions = 0;
    send.mockImplementation(async (...args) => {
      if (args[0] instanceof DeleteObjectCommand) {
        deletions += 1;
        if (deletions === 1) {
          await bothDeleting;
        } else {
          signalBothDeleting();
          await secondReleased;
        }
      }
      return storage(...args);
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
      sources.close();
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
    expect(send).not.toHaveBeenCalled();
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
    sources.close();
  });

  it.each(["ServiceUnavailable", "AccessDenied", "NoSuchBucket", "bookkeeping"])(
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
        send.mockRejectedValueOnce(
          Object.assign(new Error("secret-not-for-results"), { name: failure }),
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
      expect(JSON.stringify(error)).not.toContain("secret-not-for-results");
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
      sources.close();
    },
  );

  it("explicitly cleans failed creation without losing incomplete provenance", async () => {
    const sources = capability();
    failPut = true;
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
    sources.close();
  });
});
