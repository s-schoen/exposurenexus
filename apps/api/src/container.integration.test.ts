import { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";

import { createJobRepository } from "@exposurenexus/jobs/postgres";
import { createJobRelay } from "@exposurenexus/jobs/relay";
import { serve } from "@hono/node-server";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createAppContainer } from "./container.js";
import { CSRF_COOKIE, CSRF_HEADER } from "./middleware/csrf.js";
import { createTestDatabase } from "./test/db.js";

import type { ObjectStorage } from "@exposurenexus/backend/object-storage";
import type { JobProducer } from "@exposurenexus/jobs/producer";

vi.mock("./env.js", () => ({ env: { LOG_LEVEL: "silent" } }));

describe("API backend cutover", () => {
  const testDb = createTestDatabase();
  const logger = pino({ enabled: false });
  const storage = {
    bucket: "private-imports",
    write: vi.fn<ObjectStorage["write"]>(),
    read: vi.fn(),
    delete: vi.fn(),
    close: vi.fn(),
  };
  let container: ReturnType<typeof createAppContainer>;
  let server: ReturnType<typeof serve> | undefined;
  let origin: string;
  let initialPassword: string;
  const cookies = new Map<string, string>();

  beforeAll(async () => {
    await testDb.start();
    const bootstrapLogger = vi.spyOn(logger, "info");
    container = createAppContainer({
      db: testDb.db,
      storage,
      importSourcesConfiguration: { maxSizeBytes: 4, retentionPolicy: "keep" },
      appOrigin: "https://app.example.test",
      authSessionLifetimeHours: 12,
      authSessionHmacSecret: "0123456789012345678901234567890123456789",
      authCookieSecure: true,
      authTrustedProxies: [],
      apiTimeoutMs: 5000,
      importUploadTimeoutMs: 300000,
      logger,
      accessLogger: logger,
      dbLogger: logger,
      loggerFactory: () => logger,
    });
    await container.createDefaultAdmin();
    const message = bootstrapLogger.mock.calls.find(
      ([value]) => typeof value === "string" && value.startsWith("created admin user:"),
    )?.[0];
    if (typeof message !== "string") {
      throw new Error("bootstrap did not report initial credentials");
    }
    initialPassword = String(message).split("password=")[1]!;
    bootstrapLogger.mockRestore();
    await new Promise<void>((resolve) => {
      server = serve({ fetch: container.app.fetch, hostname: "127.0.0.1", port: 0 }, (info) => {
        origin = `http://127.0.0.1:${info.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      const activeServer = server;
      await new Promise<void>((resolve, reject) => {
        activeServer.close((error) => (error ? reject(error) : resolve()));
      });
    }
    storage.close();
    await testDb.dispose();
  });

  async function request(path: string, method = "GET", body?: object, status = 200) {
    const response = await fetch(`${origin}/api${path}`, {
      method,
      headers: {
        Origin: "https://app.example.test",
        "Content-Type": "application/json",
        Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
        [CSRF_HEADER]: decodeURIComponent(cookies.get(CSRF_COOKIE) ?? ""),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0]!;
      const separator = pair.indexOf("=");
      cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    const result = await response.json();
    expect({ status: response.status, body: result }).toMatchObject({ status });
    return result;
  }

  it("serves authenticated identity, asset and exposure workflows after migrations", async () => {
    await request("/assets", "GET", undefined, 401);
    await request("/auth", "POST", { username: "admin", password: "wrong" }, 401);
    const login = await request("/auth", "POST", { username: "admin", password: initialPassword });
    expect(login.data.user.username).toBe("admin");
    expect(login.data.session).not.toHaveProperty("tokenHash");
    expect(login.data.user).not.toHaveProperty("passwordHash");
    await request("/auth/session");
    await request("/users");
    await request("/roles");
    const user = await request(
      "/users",
      "POST",
      {
        username: "analyst",
        displayName: "Analyst",
        email: "analyst@example.test",
        password: "analyst-password",
        enabled: true,
        roleIds: [],
      },
      201,
    );
    const asset = await request(
      "/assets",
      "POST",
      {
        displayName: "Smoke host",
        type: "host",
        ownerId: user.data.id,
      },
      201,
    );
    const field = await request(
      "/assets/custom-fields",
      "POST",
      {
        key: "team",
        name: "Team",
        type: "text",
        required: false,
      },
      201,
    );
    await request(`/assets/${asset.data.id}/custom-fields/associations`, "PUT", {
      fieldIds: [field.data.id],
    });
    await request(`/assets/${asset.data.id}/custom-fields`, "PUT", {
      values: [{ fieldId: field.data.id, value: "Security" }],
    });
    const fields = await request(`/assets/${asset.data.id}/custom-fields`);
    expect(fields.data.items).toEqual([expect.objectContaining({ value: "Security" })]);
    const vulnerability = await request(
      "/vulnerabilities",
      "POST",
      {
        type: "custom",
        identifier: "smoke-weakness",
        title: "Smoke weakness",
        severity: "high",
      },
      201,
    );
    const finding = await request(
      "/findings",
      "POST",
      {
        assetId: asset.data.id,
        title: "Exposed panel",
        severity: "high",
        status: "active",
        weakness: { identifiers: {} },
        affectedResource: { type: "unspecified" },
        vulnerabilityIds: [vulnerability.data.id],
        observation: { evidence: "Panel reachable" },
      },
      201,
    );
    const observations = await request(`/findings/${finding.data.id}/observations`);
    expect(observations.data.items).toHaveLength(1);
    await request(
      `/findings/${finding.data.id}/observations/${observations.data.items[0].id}`,
      "PUT",
      {
        evidence: "Confirmed reachable",
      },
    );
    await request(`/findings/${finding.data.id}`, "PUT", { status: "confirmed" });
    expect((await request(`/findings/${finding.data.id}`)).data).toMatchObject({
      status: "confirmed",
      observationCount: 1,
      vulnerabilities: [expect.objectContaining({ id: vulnerability.data.id })],
    });
    expect((await request("/findings/stats")).data).toMatchObject({
      total: 1,
      status: { confirmed: 1 },
      severity: { high: 1 },
    });
    await request(`/assets/${asset.data.id}`, "DELETE", undefined, 409);
    await request(`/findings/${finding.data.id}`, "DELETE");
    await request(`/vulnerabilities/${vulnerability.data.id}`, "DELETE");
    await request(`/assets/${asset.data.id}`, "DELETE");
    await request("/auth", "DELETE");
    await request("/assets", "GET", undefined, 401);
    await request("/auth", "POST", { username: "analyst", password: "analyst-password" });
    await request("/assets", "GET", undefined, 403);
    await request(
      "/findings/import",
      "POST",
      { source: "nuclei", originalFilename: "scan.jsonl", sizeBytes: 0 },
      403,
    );
  });

  it("registers immutable scan metadata without bytes or submission through the protected API", async () => {
    cookies.clear();
    const metadata = {
      source: "nuclei",
      originalFilename: " ../scan.jsonl ",
      sizeBytes: 4,
      mimeType: "unverified/type",
    };
    await request("/findings/import", "POST", metadata, 401);
    const login = await request("/auth", "POST", { username: "admin", password: initialPassword });
    await request("/findings/import", "POST", { ...metadata, sizeBytes: 5 }, 400);
    expect(await testDb.db.selectFrom("import_source").selectAll().execute()).toEqual([]);

    const registered = await request("/findings/import", "POST", metadata, 201);
    expect(registered).toEqual({
      correlationId: expect.any(String),
      data: { importSourceId: expect.any(String) },
    });
    const source = await container.services.importSources.getByID(registered.data.importSourceId);
    expect(source).toMatchObject({
      ...metadata,
      id: registered.data.importSourceId,
      createdBy: login.data.user.id,
      retentionPolicy: "keep",
      ingestionId: null,
      state: "incomplete",
      availableAt: null,
      failedAt: null,
      deletedAt: null,
    });
    const repeated = await request("/findings/import", "POST", metadata, 201);
    expect(repeated.data.importSourceId).not.toBe(source!.id);
    await request("/findings/import", "POST", { ...metadata, sizeBytes: 0 }, 201);
    await request(`/findings/import/${source!.id}`, "PATCH", { originalFilename: "edited" }, 404);
    expect(await container.services.importSources.getByID(source!.id)).toEqual(source);
    expect(await testDb.db.selectFrom("ingestion").selectAll().execute()).toEqual([]);
    expect(await testDb.db.selectFrom("job").selectAll().execute()).toEqual([]);
    expect(storage.write).not.toHaveBeenCalled();
    expect(storage.read).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
    expect(storage.close).not.toHaveBeenCalled();

    expect(await testDb.db.selectFrom("import_source").selectAll().execute()).toHaveLength(3);
  });

  it("accepts one creator upload and relays its ingestion to the read-only shell", async () => {
    cookies.clear();
    const login = await request("/auth", "POST", { username: "admin", password: initialPassword });
    const metadata = {
      source: "nuclei" as const,
      originalFilename: "scan.jsonl",
      sizeBytes: 4,
      mimeType: "unverified/type",
    };
    const registered = await request("/findings/import", "POST", metadata, 201);
    const id: string = registered.data.importSourceId;
    async function upload(sourceId: string, bytes: string) {
      return await fetch(`${origin}/api/findings/import/${sourceId}/content`, {
        method: "PUT",
        headers: {
          Origin: "https://app.example.test",
          Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
          [CSRF_HEADER]: decodeURIComponent(cookies.get(CSRF_COOKIE) ?? ""),
          "Content-Type": "application/octet-stream",
        },
        body: bytes,
      });
    }
    expect((await upload("00000000-0000-4000-8000-000000000001", "nope")).status).toBe(404);
    const analyst = await testDb.db
      .selectFrom("user_profile")
      .select("id")
      .where("username", "=", "analyst")
      .executeTakeFirstOrThrow();
    const otherRegistration = await container.services.importSources.register({
      ...metadata,
      performedBy: analyst.id,
    });
    expect((await upload(otherRegistration.id, "nope")).status).toBe(403);
    expect(await container.services.importSources.getByID(otherRegistration.id)).toEqual(
      otherRegistration,
    );
    expect((await upload(id, "x")).status).toBe(400);
    expect(await container.services.importSources.getByID(id)).toMatchObject({
      uploadStartedAt: null,
    });
    expect(storage.write).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();

    let entered!: () => void;
    const writing = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    let storedBytes = Buffer.alloc(0);
    storage.write.mockImplementationOnce(async ({ body, expectedSizeBytes }) => {
      entered();
      await hold;
      expect(expectedSizeBytes).toBe(4);
      storedBytes = await buffer(body);
      expect(storedBytes).toEqual(Buffer.from("nope"));
    });
    const winner = upload(id, "nope");
    try {
      await writing;
      expect((await upload(id, "evil")).status).toBe(409);
      expect(storage.write).toHaveBeenCalledOnce();
      expect(storage.delete).not.toHaveBeenCalled();
    } finally {
      release();
    }
    const response = await winner;
    expect(response.status).toBe(202);
    const accepted = await response.json();
    expect(accepted).toEqual({
      correlationId: expect.any(String),
      data: { importSourceId: id, ingestionId: expect.any(String), jobId: expect.any(String) },
    });
    expect(await container.services.importSources.getByID(id)).toMatchObject({
      ...metadata,
      createdBy: login.data.user.id,
      retentionPolicy: "keep",
      state: "available",
      uploadStartedAt: expect.any(Date),
      ingestionId: accepted.data.ingestionId,
    });
    expect(await testDb.db.selectFrom("ingestion").selectAll().execute()).toEqual([
      {
        id: accepted.data.ingestionId,
        source: "nuclei",
        createdBy: login.data.user.id,
        createdAt: expect.any(Date),
      },
    ]);
    const pendingJobs = await testDb.db.selectFrom("job").selectAll().execute();
    expect(pendingJobs).toMatchObject([
      {
        id: accepted.data.jobId,
        publicationState: "pending",
        executionState: "pending",
        event: {
          type: "exposurenexus.jobs.ingest",
          data: { ingestionId: accepted.data.ingestionId },
        },
      },
    ]);
    expect((await upload(id, "nope")).status).toBe(409);
    expect(storage.write).toHaveBeenCalledOnce();
    expect(storage.delete).not.toHaveBeenCalled();

    const repository = createJobRepository(testDb.db);
    const producer = {
      publish: vi.fn<JobProducer["publish"]>().mockResolvedValue(undefined),
      close: vi.fn<JobProducer["close"]>().mockResolvedValue(undefined),
    };
    const relay = createJobRelay({ repository, producer, logger });
    try {
      await relay.start();
      await vi.waitFor(async () => {
        expect(await repository.getByID(accepted.data.jobId)).toMatchObject({
          publicationState: "published",
        });
      });
    } finally {
      await relay.stop();
    }
    expect(producer.publish).toHaveBeenCalledExactlyOnceWith(pendingJobs[0]!.event);
    const event = producer.publish.mock.calls[0]![0];
    expect(event.data).toEqual({ ingestionId: accepted.data.ingestionId });
    expect(storage.read).not.toHaveBeenCalled();

    async function snapshot() {
      return {
        sources: await testDb.db.selectFrom("import_source").selectAll().execute(),
        ingestions: await testDb.db.selectFrom("ingestion").selectAll().execute(),
        jobs: await repository.listAll(),
        assets: await testDb.db.selectFrom("asset").selectAll().execute(),
        vulnerabilities: await testDb.db.selectFrom("vulnerability").selectAll().execute(),
        findings: await testDb.db.selectFrom("finding").selectAll().execute(),
        observations: await testDb.db.selectFrom("observation").selectAll().execute(),
      };
    }
    const before = await snapshot();
    expect(before.jobs).toMatchObject([
      {
        publicationState: "published",
        executionState: "pending",
        executionStartedAt: null,
        executionFinishedAt: null,
        executionError: null,
      },
    ]);
    const body = Readable.from([storedBytes.subarray(0, 2), storedBytes.subarray(2)]);
    storage.read.mockResolvedValueOnce(body);
    await expect(container.services.ingestions.process(event.data.ingestionId)).resolves.toEqual({
      importSourceId: id,
      bytesRead: 4,
    });
    expect(body.readableEnded).toBe(true);
    expect(storage.read).toHaveBeenCalledExactlyOnceWith(storage.write.mock.calls[0]![0].key);
    expect(storedBytes).toEqual(Buffer.from("nope"));
    expect(storage.write).toHaveBeenCalledOnce();
    expect(storage.delete).not.toHaveBeenCalled();
    expect(await snapshot()).toEqual(before);

    const empty = await request("/findings/import", "POST", { ...metadata, sizeBytes: 0 }, 201);
    storage.write.mockImplementationOnce(async ({ body, expectedSizeBytes }) => {
      expect(expectedSizeBytes).toBe(0);
      expect(await buffer(body)).toEqual(Buffer.alloc(0));
    });
    expect((await upload(empty.data.importSourceId, "")).status).toBe(202);
    expect(await testDb.db.selectFrom("ingestion").selectAll().execute()).toHaveLength(2);
    expect(await testDb.db.selectFrom("job").selectAll().execute()).toHaveLength(2);
    expect(await testDb.db.selectFrom("observation").selectAll().execute()).toEqual([]);
    expect(await testDb.db.selectFrom("finding").selectAll().execute()).toEqual([]);
  });
});
