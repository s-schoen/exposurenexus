import { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";

import { createJobRepository } from "@exposurenexus/jobs/postgres";
import { sql } from "kysely";
import { pino } from "pino";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDatabase } from "../../database/test/database.js";
import { ApplicationError, createBackendRuntime } from "../../index.js";
import { createImportSources } from "../import-sources/index.js";
import { createIngestions } from "./index.js";

import type { ObjectStorage } from "../../object-storage/index.js";
import type { ImportSource, ImportSources } from "../import-sources/index.js";

const actorId = "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f";
const otherActorId = "00000000-0000-4000-8000-000000000001";
const input = Buffer.from("not parsed by submission");

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("ingestion submission", () => {
  const testDb = createTestDatabase();
  const objects = new Map<string, Buffer>();
  const storage = {
    bucket: "private-input",
    async write({ key, body }) {
      objects.set(key, await buffer(body));
    },
    async read(key) {
      const bytes = objects.get(key);
      if (!bytes) throw new Error("Missing test input");
      return Readable.from([bytes]);
    },
    delete: vi.fn(async (key: string) => {
      objects.delete(key);
    }),
    close() {},
  } satisfies ObjectStorage;

  beforeAll(async () => {
    await testDb.start();
    await testDb.db
      .insertInto("user_profile")
      .values(
        [actorId, otherActorId].map((id) => ({
          id,
          username: id,
          email: `${id}@example.test`,
          displayName: "Importer",
          enabled: true,
          passwordHash: "unused",
        })),
      )
      .execute();
  });
  afterAll(async () => await testDb.dispose());
  afterEach(async () => {
    vi.restoreAllMocks();
    await sql`drop trigger if exists reject_submission on import_source`.execute(testDb.db);
    await sql`drop trigger if exists reject_submission on job`.execute(testDb.db);
    await sql`drop function if exists reject_submission()`.execute(testDb.db);
  });
  beforeEach(async () => {
    objects.clear();
    storage.delete.mockClear();
    await testDb.db.deleteFrom("import_source").execute();
    await testDb.db.deleteFrom("ingestion").execute();
    await testDb.db.deleteFrom("job").execute();
  });

  async function setup(database = testDb.db) {
    const logs: string[] = [];
    const logger = pino({ level: "debug" }, { write: (line) => logs.push(line) });
    const runtime = createBackendRuntime({ database, logger });
    const sources = createImportSources(
      createBackendRuntime({ database: testDb.db, logger }),
      storage,
      { retentionPolicy: "keep" },
    );
    // Upload mechanics have their own suite; submission faults start with durable bytes.
    const registered = await sources.register({
      source: "nuclei",
      sizeBytes: input.length,
      originalFilename: "registered-scan.jsonl",
      mimeType: "unverified/type",
      performedBy: actorId,
    });
    const source = await sources.upload({
      importSourceId: registered.id,
      performedBy: actorId,
      body: Readable.from([input]),
      signal: new AbortController().signal,
    });
    const upload = vi.fn<ImportSources["upload"]>().mockResolvedValue(source);
    const ingestions = createIngestions(runtime, { ...sources, upload });
    const controller = new AbortController();
    const command = {
      importSourceId: source.id,
      performedBy: actorId,
      body: Readable.from([input]),
      contentLength: input.length,
      signal: controller.signal,
    };
    return { ingestions, upload, source, sources, command, controller, logs };
  }

  it("uploads registered input before starting its submission transaction", async () => {
    const runtime = createBackendRuntime({ database: testDb.db, logger: pino({ enabled: false }) });
    const sources = createImportSources(runtime, storage);
    const registered = await sources.register({
      source: "nuclei",
      originalFilename: "scan.jsonl",
      sizeBytes: input.length,
      performedBy: actorId,
    });
    const transaction = vi.spyOn(testDb.db, "transaction");
    const write = storage.write.bind(storage);
    vi.spyOn(storage, "write").mockImplementationOnce(async (command) => {
      expect(transaction).not.toHaveBeenCalled();
      expect(await testDb.db.selectFrom("ingestion").selectAll().execute()).toEqual([]);
      expect(await createJobRepository(testDb.db).listAll()).toEqual([]);
      await write(command);
    });

    const accepted = await createIngestions(runtime, sources).submit({
      importSourceId: registered.id,
      performedBy: actorId,
      body: Readable.from([input]),
      signal: new AbortController().signal,
    });

    expect(accepted.importSourceId).toBe(registered.id);
    expect(await sources.getByIngestionID(accepted.ingestionId)).toEqual({
      ...registered,
      ingestionId: accepted.ingestionId,
      state: "available",
      uploadStartedAt: expect.any(Date),
      availableAt: expect.any(Date),
      cleanupRequired: false,
    });
    expect(await createJobRepository(testDb.db).getByID(accepted.jobId)).toMatchObject({
      event: { data: { ingestionId: accepted.ingestionId } },
      publicationState: "pending",
    });
    expect(await buffer(await sources.readByID(registered.id))).toEqual(input);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("uses stored registration metadata and atomically accepts one ingestion and pending job", async () => {
    const { ingestions, upload, source, sources, command } = await setup();
    upload.mockResolvedValue({ ...source, source: null, createdBy: otherActorId });

    const accepted = await ingestions.submit(command);

    expect(upload).toHaveBeenCalledExactlyOnceWith(command);
    expect(accepted).toEqual({
      importSourceId: source.id,
      ingestionId: expect.any(String),
      jobId: expect.any(String),
    });
    expect(new Set(Object.values(accepted)).size).toBe(3);
    expect(await sources.getByIngestionID(accepted.ingestionId)).toEqual({
      ...source,
      ingestionId: accepted.ingestionId,
    });
    expect(await testDb.db.selectFrom("ingestion").selectAll().execute()).toEqual([
      {
        id: accepted.ingestionId,
        source: "nuclei",
        createdBy: actorId,
        createdAt: expect.any(Date),
      },
    ]);
    const jobs = await createJobRepository(testDb.db).listAll();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      id: accepted.jobId,
      publicationState: "pending",
      publicationAttempts: 0,
      publishedAt: null,
      executionState: "pending",
      executionStartedAt: null,
    });
    expect(jobs[0]?.event).toEqual({
      id: accepted.jobId,
      specversion: "1.0",
      source: "/services/api",
      type: "exposurenexus.jobs.ingest",
      datacontenttype: "application/json",
      time: expect.any(String),
      data: { ingestionId: accepted.ingestionId },
    });
    expect(await buffer(await sources.readByID(source.id))).toEqual(input);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it.each([
    { state: "incomplete" as const, availableAt: null },
    { state: "deleted" as const, deletedAt: new Date("2026-09-15T00:00:00Z") },
    { source: null },
    { createdBy: otherActorId },
  ])(
    "rejects an ineligible stored source despite an available upload result: %j",
    async (change) => {
      const { ingestions, command, source } = await setup();
      await testDb.db
        .updateTable("import_source")
        .set(change)
        .where("id", "=", source.id)
        .execute();

      await expect(ingestions.submit(command)).rejects.toMatchObject({
        code: "ingestion.source_not_submittable",
        kind: "conflict",
        details: { sourceId: source.id },
      });
      expect(await testDb.db.selectFrom("ingestion").selectAll().execute()).toEqual([]);
      expect(await createJobRepository(testDb.db).listAll()).toEqual([]);
      expect(storage.delete).not.toHaveBeenCalled();
    },
  );

  it("rejects a missing stored source without creating an ingestion or job", async () => {
    const { ingestions, source, command } = await setup();
    await testDb.db.deleteFrom("import_source").where("id", "=", source.id).execute();

    await expect(ingestions.submit(command)).rejects.toMatchObject({
      code: "ingestion.source_not_submittable",
      kind: "conflict",
    });
    expect(await testDb.db.selectFrom("ingestion").selectAll().execute()).toEqual([]);
    expect(await createJobRepository(testDb.db).listAll()).toEqual([]);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("cannot replace the link or create duplicate ingestions/jobs under concurrent submission", async () => {
    const { ingestions, command, source, sources } = await setup();
    const results = await Promise.allSettled([
      ingestions.submit(command),
      ingestions.submit({ ...command, body: Readable.from([input]) }),
    ]);
    const accepted = results.find((result) => result.status === "fulfilled")!;
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "ingestion.source_not_submittable", kind: "conflict" },
    });
    await expect(ingestions.submit(command)).rejects.toMatchObject({
      code: "ingestion.source_not_submittable",
      kind: "conflict",
    });
    expect(await testDb.db.selectFrom("ingestion").selectAll().execute()).toHaveLength(1);
    expect(await createJobRepository(testDb.db).listAll()).toHaveLength(1);
    expect(await sources.getByID(source.id)).toEqual({
      ...source,
      ingestionId: accepted.value.ingestionId,
    });
    expect(await buffer(await sources.readByID(source.id))).toEqual(input);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it.each(["link", "job", "ignored link"])(
    "rolls back all submission changes and retains stored input when %s fails",
    async (failure) => {
      const { ingestions, command, source, sources, logs } = await setup();
      if (failure === "ignored link") {
        await sql`
          create function reject_submission() returns trigger language plpgsql as $$
          begin return null; end $$
        `.execute(testDb.db);
      } else {
        await sql`
          create function reject_submission() returns trigger language plpgsql as $$
          begin raise exception 'private-database-failure'; end $$
        `.execute(testDb.db);
      }
      if (failure === "job") {
        await sql`
          create trigger reject_submission before insert on job
          for each row execute function reject_submission()
        `.execute(testDb.db);
      } else {
        await sql`
          create trigger reject_submission before update of "ingestionId" on import_source
          for each row execute function reject_submission()
        `.execute(testDb.db);
      }

      const error = await ingestions.submit(command).catch((error: unknown) => error);

      expect(error).toBeInstanceOf(ApplicationError);
      expect(error).toMatchObject({
        code:
          failure === "ignored link"
            ? "ingestion.source_not_submittable"
            : "ingestion.submit_failed",
        details: { sourceId: source.id },
        cause: undefined,
      });
      expect(await testDb.db.selectFrom("ingestion").selectAll().execute()).toEqual([]);
      expect(await createJobRepository(testDb.db).listAll()).toEqual([]);
      expect(await sources.getByID(source.id)).toEqual(source);
      expect(await buffer(await sources.readByID(source.id))).toEqual(input);
      expect(storage.delete).not.toHaveBeenCalled();
      expect(logs.join("")).toContain(`"sourceId":"${source.id}"`);
      expect(logs.join("")).not.toContain("private-database-failure");
      expect(logs.join("")).not.toContain("registered-scan.jsonl");
      expect(logs.join("")).not.toContain("private-input");
    },
  );

  it.each([
    undefined,
    "private-cancellation-reason",
    { message: "private-cancellation-reason" },
    new Error("private-cancellation-reason"),
    NaN,
  ])("destroys pre-cancelled input without claiming it for reason %j", async (reason) => {
    const runtime = createBackendRuntime({ database: testDb.db, logger: pino({ enabled: false }) });
    const sources = createImportSources(runtime, storage);
    const registered = await sources.register({
      source: "nuclei",
      originalFilename: "scan.jsonl",
      sizeBytes: input.length,
      performedBy: actorId,
    });
    const ingestions = createIngestions(runtime, sources);
    const body = new Readable({ read() {} });
    const controller = new AbortController();
    const transaction = vi.spyOn(testDb.db, "transaction");
    const write = vi.spyOn(storage, "write");
    controller.abort(reason);

    await expect(
      ingestions.submit({
        importSourceId: registered.id,
        performedBy: actorId,
        body,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      name: "ApplicationError",
      code: "import_source.upload_cancelled",
      kind: "conflict",
      message: "Import source upload was cancelled",
      details: { sourceId: registered.id },
      cause: undefined,
    });

    expect(body.destroyed).toBe(true);
    expect(body.readableDidRead).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(await sources.getByID(registered.id)).toEqual(registered);
    expect(await testDb.db.selectFrom("ingestion").selectAll().execute()).toEqual([]);
    expect(await createJobRepository(testDb.db).listAll()).toEqual([]);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("validates runtime submissions before taking ownership of invalid input", async () => {
    const runtime = createBackendRuntime({ database: testDb.db, logger: pino({ enabled: false }) });
    const ingestions = createIngestions(runtime, createImportSources(runtime, storage));
    const body = new Readable({ read() {} });
    const command = {
      importSourceId: actorId,
      performedBy: actorId,
      body,
      signal: new AbortController().signal,
    };
    const lookup = vi.spyOn(testDb.db, "selectFrom");
    const transaction = vi.spyOn(testDb.db, "transaction");
    const write = vi.spyOn(storage, "write");
    try {
      for (const invalid of [
        undefined,
        null,
        ...[undefined, null, {}, { aborted: true }].map((signal) => ({ ...command, signal })),
        ...[undefined, null, {}, Buffer.from("not a stream")].map((body) => ({ ...command, body })),
      ]) {
        await expect(ingestions.submit(invalid as never)).rejects.toMatchObject({
          name: "ApplicationError",
          code: "import_source.invalid_input",
          kind: "validation",
          cause: undefined,
        });
      }
      expect(body.destroyed).toBe(false);
      expect(body.readableDidRead).toBe(false);
      expect(lookup).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
      expect(storage.delete).not.toHaveBeenCalled();
    } finally {
      body.destroy();
    }
  });

  it("preserves safe preclaim upload cancellation through submission for a non-Error reason", async () => {
    const logger = pino({ enabled: false });
    const sources = createImportSources(
      createBackendRuntime({ database: testDb.db, logger }),
      storage,
    );
    const registered = await sources.register({
      source: "nuclei",
      originalFilename: "scan.jsonl",
      sizeBytes: input.length,
      performedBy: actorId,
    });
    const controller = new AbortController();
    const database = testDb.db.withPlugin({
      transformQuery: ({ node }) => node,
      async transformResult({ result }) {
        controller.abort(NaN);
        return result;
      },
    });
    const runtime = createBackendRuntime({ database, logger });
    const ingestions = createIngestions(runtime, createImportSources(runtime, storage));
    const body = Readable.from([input]);

    const error = await ingestions
      .submit({
        importSourceId: registered.id,
        performedBy: actorId,
        body,
        signal: controller.signal,
      })
      .catch((error: unknown) => error);

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: "import_source.upload_cancelled",
      kind: "conflict",
      message: "Import source upload was cancelled",
      details: { sourceId: registered.id },
      cause: undefined,
    });
    expect(body.destroyed).toBe(true);
    expect(await sources.getByID(registered.id)).toEqual(registered);
    expect(await testDb.db.selectFrom("ingestion").selectAll().execute()).toEqual([]);
    expect(await createJobRepository(testDb.db).listAll()).toEqual([]);
    expect(objects.size).toBe(0);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("propagates unsuccessful upload without starting submission or compensating again", async () => {
    const { ingestions, upload, command, logs } = await setup();
    const failure = new ApplicationError({
      code: "import_source.create_failed",
      kind: "unexpected",
      message: "Upload failed",
      details: {
        sourceId: command.importSourceId,
        reason: "transfer_failed",
        cleanupRequired: false,
      },
    });
    upload.mockRejectedValueOnce(failure);
    const transaction = vi.spyOn(testDb.db, "transaction");

    await expect(ingestions.submit(command)).rejects.toBe(failure);

    expect(transaction).not.toHaveBeenCalled();
    expect(await testDb.db.selectFrom("ingestion").selectAll().execute()).toEqual([]);
    expect(await createJobRepository(testDb.db).listAll()).toEqual([]);
    expect(storage.delete).not.toHaveBeenCalled();
    expect(logs).toEqual([]);
  });

  it("does not start submission after cancellation during upload, even if durable upload succeeds", async () => {
    const { ingestions, upload, source, sources, command, controller, logs } = await setup();
    const uploaded = deferred<ImportSource>();
    upload.mockReturnValueOnce(uploaded.promise);
    const transaction = vi.spyOn(testDb.db, "transaction");
    const submitted = ingestions.submit(command).catch((error: unknown) => error);
    controller.abort(new Error("private-cancellation-reason"));
    uploaded.resolve(source);

    expect(await submitted).toMatchObject({
      name: "ApplicationError",
      code: "ingestion.submit_cancelled",
      kind: "conflict",
      message: "Ingestion submission was cancelled",
      details: { sourceId: source.id },
      cause: undefined,
    });
    expect(transaction).not.toHaveBeenCalled();
    expect(await testDb.db.selectFrom("ingestion").selectAll().execute()).toEqual([]);
    expect(await createJobRepository(testDb.db).listAll()).toEqual([]);
    expect(await sources.getByID(source.id)).toEqual(source);
    expect(await buffer(await sources.readByID(source.id))).toEqual(input);
    expect(storage.delete).not.toHaveBeenCalled();
    expect(logs.join("")).toContain(`"sourceId":"${source.id}"`);
    expect(logs.join("")).not.toContain("private-cancellation-reason");
  });

  it("prevents late submission when cancelled while waiting for a transaction connection", async () => {
    const { ingestions, source, sources, command, controller } = await setup();
    const held = deferred();
    const release = deferred();
    const blocker = testDb.db.transaction().execute(async () => {
      held.resolve();
      await release.promise;
    });
    await held.promise;
    const requested = deferred();
    const transaction = testDb.db.transaction.bind(testDb.db);
    vi.spyOn(testDb.db, "transaction").mockImplementation(() => {
      requested.resolve();
      return transaction();
    });
    const submitted = ingestions.submit(command).catch((error: unknown) => error);
    try {
      await requested.promise;
      controller.abort(new Error("cancelled while queued"));
    } finally {
      release.resolve();
      await blocker;
    }

    expect(await submitted).toMatchObject({
      name: "ApplicationError",
      code: "ingestion.submit_cancelled",
      kind: "conflict",
      message: "Ingestion submission was cancelled",
      details: { sourceId: source.id },
      cause: undefined,
    });
    expect(await testDb.db.selectFrom("ingestion").selectAll().execute()).toEqual([]);
    expect(await createJobRepository(testDb.db).listAll()).toEqual([]);
    expect(await sources.getByID(source.id)).toEqual(source);
    expect(await buffer(await sources.readByID(source.id))).toEqual(input);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("prevents late writes when cancelled while waiting for the locked source", async () => {
    const selected = deferred();
    const release = deferred();
    const database = testDb.db.withPlugin({
      transformQuery: ({ node }) => node,
      async transformResult({ result }) {
        selected.resolve();
        await release.promise;
        return result;
      },
    });
    const { ingestions, command, controller, source, sources } = await setup(database);
    const submitted = ingestions.submit(command).catch((error: unknown) => error);
    try {
      await selected.promise;
      controller.abort(new Error("cancelled while locking source"));
    } finally {
      release.resolve();
    }

    expect(await submitted).toMatchObject({
      name: "ApplicationError",
      code: "ingestion.submit_cancelled",
      kind: "conflict",
      message: "Ingestion submission was cancelled",
      details: { sourceId: source.id },
      cause: undefined,
    });
    expect(await testDb.db.selectFrom("ingestion").selectAll().execute()).toEqual([]);
    expect(await createJobRepository(testDb.db).listAll()).toEqual([]);
    expect(await sources.getByID(source.id)).toEqual(source);
    expect(await buffer(await sources.readByID(source.id))).toEqual(input);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("retains committed input and logs only a safe source ID when the commit response is lost", async () => {
    const { ingestions, source, sources, command, logs } = await setup();
    const transaction = testDb.db.transaction.bind(testDb.db);
    vi.spyOn(testDb.db, "transaction").mockImplementation(() => {
      const builder = transaction();
      const execute = builder.execute.bind(builder);
      vi.spyOn(builder, "execute").mockImplementation(async (callback) => {
        await execute(callback);
        throw new Error("private-commit-response-lost");
      });
      return builder;
    });

    const error = await ingestions.submit(command).catch((error: unknown) => error);

    expect(error).toMatchObject({
      code: "ingestion.submit_failed",
      kind: "unexpected",
      details: { sourceId: source.id },
      cause: undefined,
    });
    const persisted = (await sources.getByID(source.id))!;
    expect(persisted).toEqual({ ...source, ingestionId: expect.any(String) });
    expect(await testDb.db.selectFrom("ingestion").selectAll().execute()).toHaveLength(1);
    expect(await createJobRepository(testDb.db).listAll()).toMatchObject([
      { event: { data: { ingestionId: persisted.ingestionId } }, publicationState: "pending" },
    ]);
    expect(await buffer(await sources.readByID(source.id))).toEqual(input);
    expect(storage.delete).not.toHaveBeenCalled();
    expect(logs.join("")).toContain(`"sourceId":"${source.id}"`);
    expect(logs.join("")).not.toContain("private-commit-response-lost");
    expect(logs.join("")).not.toContain("private-input");
  });
});
