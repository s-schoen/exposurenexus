import { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import { setImmediate } from "node:timers/promises";

import { createJobRepository } from "@exposurenexus/jobs/postgres";
import { pino } from "pino";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDatabase } from "../../database/test/database.js";
import { ApplicationError, createBackendRuntime } from "../../index.js";
import { createImportSources } from "../import-sources/index.js";
import { createIngestions } from "./index.js";

import type { ObjectStorage } from "../../object-storage/index.js";
import type { ImportSourcesConfiguration } from "../import-sources/index.js";

const actorId = "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f";
const input = Buffer.from([0x61, 0xc3, 0xa4, 0xff, 0x0a]);

describe("ingestion processing shell", () => {
  const testDb = createTestDatabase();
  const objects = new Map<string, Buffer>();
  const queries: string[] = [];
  const storage = {
    bucket: "private-input",
    write: vi.fn<ObjectStorage["write"]>(async ({ key, body }) => {
      objects.set(key, await buffer(body));
    }),
    read: vi.fn<ObjectStorage["read"]>(async (key) => {
      const bytes = objects.get(key);
      if (!bytes) throw new Error("Missing test input");
      return Readable.from([bytes]);
    }),
    delete: vi.fn<ObjectStorage["delete"]>(async (key) => {
      objects.delete(key);
    }),
    close: vi.fn(),
  } satisfies ObjectStorage;

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
  beforeEach(async () => {
    vi.clearAllMocks();
    objects.clear();
    queries.length = 0;
    await testDb.db.deleteFrom("import_source").execute();
    await testDb.db.deleteFrom("ingestion").execute();
    await testDb.db.deleteFrom("job").execute();
  });
  afterEach(() => {
    expect(queries.filter((kind) => kind !== "SelectQueryNode")).toEqual([]);
    expect(storage.write).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
    expect(storage.close).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  async function setup(
    bytes = input,
    retentionPolicy: ImportSourcesConfiguration["retentionPolicy"] = "temporary",
  ) {
    const database = testDb.db.withPlugin({
      transformQuery({ node }) {
        queries.push(node.kind);
        return node;
      },
      async transformResult({ result }) {
        return result;
      },
    });
    const runtime = createBackendRuntime({ database, logger: pino({ enabled: false }) });
    const sources = createImportSources(runtime, storage, { retentionPolicy });
    const ingestions = createIngestions(runtime, sources);
    const registered = await sources.register({
      source: "nuclei",
      sizeBytes: bytes.length,
      originalFilename: "scan.jsonl",
      performedBy: actorId,
    });
    const accepted = await ingestions.submit({
      importSourceId: registered.id,
      performedBy: actorId,
      body: Readable.from([bytes]),
      signal: new AbortController().signal,
    });
    storage.write.mockClear();
    queries.length = 0;
    return { runtime, sources, ingestions, ...accepted };
  }

  async function snapshot() {
    return {
      sources: await testDb.db.selectFrom("import_source").selectAll().execute(),
      ingestions: await testDb.db.selectFrom("ingestion").selectAll().execute(),
      jobs: await createJobRepository(testDb.db).listAll(),
      assets: await testDb.db.selectFrom("asset").selectAll().execute(),
      vulnerabilities: await testDb.db.selectFrom("vulnerability").selectAll().execute(),
      findings: await testDb.db.selectFrom("finding").selectAll().execute(),
      observations: await testDb.db.selectFrom("observation").selectAll().execute(),
      objects: new Map([...objects].map(([key, bytes]) => [key, Buffer.from(bytes)])),
    };
  }

  it("awaits the entire byte stream without changing accepted input or pending execution", async () => {
    const { ingestions, ingestionId, importSourceId } = await setup();
    const before = await snapshot();
    const started = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<void>();
    const body = Readable.from(
      (async function* () {
        yield input.subarray(0, 2);
        started.resolve();
        await finish.promise;
        yield input.subarray(2);
      })(),
      { objectMode: false, highWaterMark: 1 },
    );
    storage.read.mockResolvedValueOnce(body);
    const completed = vi.fn();
    const result = ingestions.process(ingestionId).then((value) => {
      completed();
      return value;
    });

    try {
      await started.promise;
      expect(completed).not.toHaveBeenCalled();
      expect(await snapshot()).toEqual(before);
    } finally {
      finish.resolve();
    }

    await expect(result).resolves.toEqual({ importSourceId, bytesRead: 5 });
    expect(body.readableEnded).toBe(true);
    expect(body.destroyed).toBe(true);
    expect(await snapshot()).toEqual(before);
    expect(before.jobs).toMatchObject([
      { executionState: "pending", executionStartedAt: null, executionFinishedAt: null },
    ]);
  });

  it("rejects a late stream failure with safe diagnostics and preserves input for retry", async () => {
    const { ingestions, ingestionId, importSourceId } = await setup();
    const before = await snapshot();
    const secret = "https://access-key:secret-key@storage.example.test/private-input";
    const body = Readable.from(
      (async function* () {
        yield input.subarray(0, 2);
        await setImmediate();
        throw new Error(secret);
      })(),
      { objectMode: false, highWaterMark: 1 },
    );
    storage.read.mockResolvedValueOnce(body);

    const error = await ingestions.process(ingestionId).catch((error: unknown) => error);

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: "import_source.read_failed",
      kind: "unexpected",
      message: "Import source could not be read",
      details: { sourceId: importSourceId },
      cause: undefined,
    });
    const logs: string[] = [];
    pino({}, { write: (line) => logs.push(line) }).error({ err: error }, "failed to process job");
    expect(logs.join("")).not.toContain(secret);
    expect(body.readableDidRead).toBe(true);
    expect(body.destroyed).toBe(true);
    expect(await snapshot()).toEqual(before);
    await expect(ingestions.process(ingestionId)).resolves.toEqual({
      importSourceId,
      bytesRead: 5,
    });
    expect(await snapshot()).toEqual(before);
  });

  it("rejects a premature stream close rather than reporting partial success", async () => {
    const { ingestions, ingestionId, importSourceId } = await setup();
    const before = await snapshot();
    const started = Promise.withResolvers<void>();
    const body = new Readable({ read: () => started.resolve() });
    storage.read.mockResolvedValueOnce(body);
    const result = ingestions.process(ingestionId);
    await started.promise;
    body.push(input.subarray(0, 2));
    await setImmediate();
    body.destroy();

    await expect(result).rejects.toMatchObject({
      code: "import_source.read_failed",
      kind: "unexpected",
      details: { sourceId: importSourceId },
      cause: undefined,
    });
    expect(body.readableDidRead).toBe(true);
    expect(body.destroyed).toBe(true);
    expect(await snapshot()).toEqual(before);
  });

  it.each([Buffer.from("abc"), Buffer.from("abcdef")])(
    "rejects clean EOF with a different stored length: %j",
    async (bytes) => {
      const { ingestions, ingestionId, importSourceId } = await setup();
      const before = await snapshot();
      const body = Readable.from([bytes]);
      storage.read.mockResolvedValueOnce(body);

      await expect(ingestions.process(ingestionId)).rejects.toMatchObject({
        code: "import_source.read_failed",
        kind: "unexpected",
        details: { sourceId: importSourceId },
        cause: undefined,
      });
      expect(body.readableEnded).toBe(true);
      expect(body.destroyed).toBe(true);
      expect(await snapshot()).toEqual(before);
    },
  );

  it.each(["unknown ingestion", "unlinked ingestion", "removed source"])(
    "rejects missing input for an %s before storage access",
    async (missing) => {
      const { ingestions, ingestionId, importSourceId } = await setup();
      if (missing === "unlinked ingestion") {
        await testDb.db
          .updateTable("import_source")
          .set({ ingestionId: null })
          .where("id", "=", importSourceId)
          .execute();
      } else if (missing === "removed source") {
        await testDb.db.deleteFrom("import_source").where("id", "=", importSourceId).execute();
      }
      const requestedId = missing === "unknown ingestion" ? actorId : ingestionId;
      const before = await snapshot();

      await expect(ingestions.process(requestedId)).rejects.toMatchObject({
        code: "ingestion.source_not_found",
        kind: "missing",
        details: { ingestionId: requestedId },
        cause: undefined,
      });
      expect(storage.read).not.toHaveBeenCalled();
      expect(await snapshot()).toEqual(before);
    },
  );

  it.each([
    { state: "incomplete" as const, availableAt: null },
    { state: "incomplete" as const, availableAt: null, failedAt: new Date("2026-09-16") },
    { state: "deleted" as const, deletedAt: new Date("2026-09-16") },
  ])("preserves source lifecycle validation without storage access: %j", async (change) => {
    const { ingestions, ingestionId, importSourceId } = await setup();
    await testDb.db
      .updateTable("import_source")
      .set(change)
      .where("id", "=", importSourceId)
      .execute();
    const before = await snapshot();

    await expect(ingestions.process(ingestionId)).rejects.toMatchObject({
      code: "import_source.not_available",
      kind: "conflict",
      details: { sourceId: importSourceId },
    });
    expect(storage.read).not.toHaveBeenCalled();
    expect(await snapshot()).toEqual(before);
  });

  it("preserves bucket identity checks without reading or modifying input", async () => {
    const { runtime, ingestionId, importSourceId } = await setup();
    const sources = createImportSources(runtime, { ...storage, bucket: "different-bucket" });
    const ingestions = createIngestions(runtime, sources);
    const before = await snapshot();

    await expect(ingestions.process(ingestionId)).rejects.toMatchObject({
      code: "import_source.bucket_mismatch",
      kind: "conflict",
      details: { sourceId: importSourceId },
    });
    expect(storage.read).not.toHaveBeenCalled();
    expect(await snapshot()).toEqual(before);
  });

  it.each(["missing object", "storage failure"])(
    "propagates a safe read error for %s without changing pending execution",
    async (failure) => {
      const { ingestions, ingestionId, importSourceId } = await setup();
      if (failure === "missing object") objects.clear();
      else storage.read.mockRejectedValueOnce(new Error("private-storage-credentials"));
      const before = await snapshot();

      await expect(ingestions.process(ingestionId)).rejects.toMatchObject({
        code: "import_source.read_failed",
        kind: "unexpected",
        message: "Import source could not be read",
        details: { sourceId: importSourceId },
        cause: undefined,
      });
      expect(await snapshot()).toEqual(before);
    },
  );

  it("propagates safe lookup failures without storage access", async () => {
    const { ingestionId } = await setup();
    const database = testDb.db.withPlugin({
      transformQuery() {
        throw new Error("private-database-credentials");
      },
      async transformResult({ result }) {
        return result;
      },
    });
    const runtime = createBackendRuntime({ database, logger: pino({ enabled: false }) });
    const ingestions = createIngestions(runtime, createImportSources(runtime, storage));
    const before = await snapshot();

    await expect(ingestions.process(ingestionId)).rejects.toMatchObject({
      code: "import_source.get_by_ingestion_failed",
      kind: "unexpected",
      message: "Import source metadata could not be read by ingestion",
      details: { ingestionId },
      cause: undefined,
    });
    expect(storage.read).not.toHaveBeenCalled();
    expect(await snapshot()).toEqual(before);
  });

  it.each([
    { contents: "empty", bytes: Buffer.alloc(0), bytesRead: 0 },
    { contents: "malformed", bytes: input, bytesRead: 5 },
  ])("completes $contents input without parsing it", async ({ bytes, bytesRead }) => {
    const { ingestions, ingestionId, importSourceId } = await setup(bytes);
    const before = await snapshot();

    await expect(ingestions.process(ingestionId)).resolves.toEqual({ importSourceId, bytesRead });
    expect(storage.read).toHaveBeenCalledOnce();
    expect(await snapshot()).toEqual(before);
  });

  it.each(["temporary", "keep"] as const)(
    "allows concurrent and repeated reads of %s input without mutations or cleanup",
    async (retentionPolicy) => {
      const { ingestions, ingestionId, importSourceId } = await setup(input, retentionPolicy);
      const before = await snapshot();

      await expect(
        Promise.all([ingestions.process(ingestionId), ingestions.process(ingestionId)]),
      ).resolves.toEqual([
        { importSourceId, bytesRead: 5 },
        { importSourceId, bytesRead: 5 },
      ]);
      await expect(ingestions.process(ingestionId)).resolves.toEqual({
        importSourceId,
        bytesRead: 5,
      });
      expect(storage.read).toHaveBeenCalledTimes(3);
      expect(await snapshot()).toEqual(before);
    },
  );
});
