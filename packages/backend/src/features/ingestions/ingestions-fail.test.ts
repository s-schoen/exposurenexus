import { ScannerSource } from "@exposurenexus/contracts/model/observation";
import { pino } from "pino";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDatabase } from "../../database/test/database.js";
import { createBackendRuntime } from "../../index.js";
import { createIngestions } from "./index.js";

import type { ImportSources } from "../import-sources/index.js";

const actorId = "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f";
const unknownIngestionId = "00000000-0000-4000-8000-000000000001";
const createdAt = new Date("2026-10-08T12:00:00.000Z");
const processedAt = new Date("2026-10-08T12:05:00.000Z");

describe("ingestion failure", () => {
  const testDb = createTestDatabase();
  const importSources = {
    upload: vi.fn(),
    getByIngestionID: vi.fn(),
    readByID: vi.fn(),
  } satisfies Pick<ImportSources, "upload" | "getByIngestionID" | "readByID">;

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
    await testDb.db.deleteFrom("ingestion").execute();
  });

  function ingestions(database = testDb.db) {
    return createIngestions(
      createBackendRuntime({ database, logger: pino({ enabled: false }) }),
      importSources,
    );
  }

  async function insertIngestion(
    state: { status: "completed" } | { status: "failed"; failureCode: string } | { status?: never },
  ) {
    const { id } = await testDb.db
      .insertInto("ingestion")
      .values({
        source: ScannerSource.Trivy,
        createdBy: actorId,
        createdAt,
        ...(state.status ? { processedAt } : {}),
        ...state,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    return id;
  }

  async function row(id: string) {
    return await testDb.db
      .selectFrom("ingestion")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
  }

  it("moves a pending ingestion to failed with its code and processing time", async () => {
    const id = await insertIngestion({});
    const before = Date.now();

    await expect(ingestions().fail(id, "ingestion.parse_failed")).resolves.toEqual({
      status: "failed",
    });

    const failed = await row(id);
    expect(failed).toEqual({
      id,
      source: ScannerSource.Trivy,
      createdBy: actorId,
      createdAt,
      status: "failed",
      processedAt: expect.any(Date),
      failureCode: "ingestion.parse_failed",
    });
    expect(failed.processedAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(importSources.readByID).not.toHaveBeenCalled();
  });

  it.each([
    { status: "completed" as const },
    { status: "failed" as const, failureCode: "ingestion.parse_failed" },
  ])("leaves an already $status ingestion unchanged", async (state) => {
    const id = await insertIngestion(state);
    const before = await row(id);

    await expect(ingestions().fail(id, "ingestion.other_failure")).resolves.toEqual({
      status: "already_processed",
    });
    expect(await row(id)).toEqual(before);
  });

  it("records only one failure when failures race", async () => {
    const id = await insertIngestion({});

    const results = await Promise.all([
      ingestions().fail(id, "ingestion.first"),
      ingestions().fail(id, "ingestion.second"),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(["already_processed", "failed"]);
    expect(["ingestion.first", "ingestion.second"]).toContain((await row(id)).failureCode);
  });

  it("rejects an unknown ingestion", async () => {
    await expect(
      ingestions().fail(unknownIngestionId, "ingestion.parse_failed"),
    ).rejects.toMatchObject({
      code: "ingestion.not_found",
      kind: "missing",
      details: { ingestionId: unknownIngestionId },
    });
  });

  it("hides database failure details", async () => {
    const id = await insertIngestion({});
    const database = testDb.db.withPlugin({
      transformQuery() {
        throw new Error("private-database-credentials");
      },
      async transformResult({ result }) {
        return result;
      },
    });

    const error = await ingestions(database)
      .fail(id, "ingestion.parse_failed")
      .catch((error: unknown) => error);

    expect(error).toMatchObject({
      code: "ingestion.fail_failed",
      kind: "unexpected",
      message: "Ingestion failure could not be recorded",
      details: { ingestionId: id },
      cause: undefined,
    });
    expect((await row(id)).status).toBe("pending");
  });
});
