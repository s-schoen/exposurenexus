import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import {
  AssetEnvironment,
  AssetLifecycleState,
  AssetType,
} from "@exposurenexus/contracts/model/asset";
import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { ObservationSource, ScannerSource } from "@exposurenexus/contracts/model/observation";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { pino } from "pino";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createTestDatabase,
  insertTestAsset,
  resetTestDatabase,
} from "../../database/test/database.js";
import { createBackendRuntime } from "../../index.js";
import { createIngestions } from "./index.js";

import type { ImportSources } from "../import-sources/index.js";
import type { IngestionPlan, PlannedObservation } from "./index.js";

const actorId = "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f";
const editorId = "3c0f4c1e-0d4b-4b0e-9a61-0d6f4ad2e5b7";
const unknownIngestionId = "00000000-0000-4000-8000-000000000001";
const seededAt = new Date("2026-10-01T00:00:00.000Z");
const ingestionCreatedAt = new Date("2026-10-08T12:00:00.000Z");
const observedAt = new Date("2026-10-08T11:00:00.000Z");

function observation(overrides: Partial<PlannedObservation> = {}): PlannedObservation {
  return {
    title: "Outdated openssl",
    description: "openssl is vulnerable",
    evidence: "openssl 3.0.1",
    remediation: "Upgrade openssl",
    severity: VulnerabilitySeverity.Medium,
    weakness: { identifiers: { cve: ["cve-2026-0001"] } },
    affectedResource: {
      type: AffectedResourceType.Package,
      ecosystem: "deb",
      name: "openssl",
      version: "3.0.1",
    },
    fingerprints: { trivy: ["b", "a", "a"] },
    observedAt,
    ...overrides,
  };
}

describe("ingestion recording", () => {
  const testDb = createTestDatabase();
  const importSources = {
    upload: vi.fn(),
    getByIngestionID: vi.fn(),
    readByID: vi.fn(),
  } satisfies Pick<ImportSources, "upload" | "getByIngestionID" | "readByID">;

  beforeAll(async () => await testDb.start());
  afterAll(async () => await testDb.dispose());
  beforeEach(async () => {
    await resetTestDatabase(testDb.db);
    await testDb.db
      .insertInto("user_profile")
      .values(
        [actorId, editorId].map((id, index) => ({
          id,
          username: `user-${index}`,
          email: `user-${index}@example.test`,
          displayName: `User ${index}`,
          enabled: true,
          passwordHash: "unused",
        })),
      )
      .execute();
  });

  function ingestions(database = testDb.db) {
    return createIngestions(
      createBackendRuntime({ database, logger: pino({ enabled: false }) }),
      importSources,
    );
  }

  async function insertIngestion() {
    const { id } = await testDb.db
      .insertInto("ingestion")
      .values({ source: ScannerSource.Trivy, createdBy: actorId, createdAt: ingestionCreatedAt })
      .returning("id")
      .executeTakeFirstOrThrow();
    return id;
  }

  async function insertAsset(displayName: string) {
    const { id } = await insertTestAsset(testDb.db, {
      displayName,
      type: AssetType.Host,
      environment: AssetEnvironment.Production,
      lifecycleState: AssetLifecycleState.Active,
      ownerId: null,
      createdAt: seededAt,
      updatedAt: seededAt,
      createdBy: editorId,
      updatedBy: editorId,
    });
    return id;
  }

  async function insertFinding(assetId: string, status = FindingStatus.Active) {
    const { id } = await testDb.db
      .insertInto("finding")
      .values({
        assetId,
        title: "Existing finding",
        severity: VulnerabilitySeverity.Low,
        status,
        assigneeId: editorId,
        dueDate: new Date("2026-11-01T00:00:00.000Z"),
        mitigation: "Compensating control",
        weakness: { identifiers: {} },
        affectedResource: { type: AffectedResourceType.Unspecified },
        createdAt: seededAt,
        updatedAt: seededAt,
        createdBy: editorId,
        updatedBy: editorId,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    return id;
  }

  async function snapshot() {
    return {
      ingestions: await testDb.db.selectFrom("ingestion").selectAll().orderBy("id").execute(),
      findings: await testDb.db.selectFrom("finding").selectAll().orderBy("id").execute(),
      observations: await testDb.db.selectFrom("observation").selectAll().orderBy("id").execute(),
    };
  }

  async function findingByID(id: string) {
    return await testDb.db
      .selectFrom("finding")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
  }

  it("creates findings and attaches observations in one go", async () => {
    const ingestionId = await insertIngestion();
    const existingAssetId = await insertAsset("existing.example.com");
    const newAssetId = await insertAsset("new.example.com");
    const existingFindingId = await insertFinding(existingAssetId);
    const before = Date.now();

    const result = await ingestions().record(ingestionId, {
      newFindings: [
        {
          assetId: newAssetId,
          finding: {
            title: "Outdated openssl",
            severity: VulnerabilitySeverity.High,
            weakness: { identifiers: { cve: ["cve-2026-0001"] } },
            affectedResource: { type: AffectedResourceType.Package, name: "openssl" },
          },
          observations: [
            observation(),
            observation({ title: "Outdated openssl again", severity: VulnerabilitySeverity.High }),
          ],
        },
      ],
      attachments: [
        {
          findingId: existingFindingId,
          assetId: existingAssetId,
          observations: [observation({ title: "Seen again" })],
        },
      ],
    });

    expect(result).toEqual({
      status: "recorded",
      createdFindingIds: [expect.any(String)],
      attachedObservations: 1,
      reopenedFindingIds: [],
    });
    const createdFindingId = result.status === "recorded" ? result.createdFindingIds[0]! : "";
    const created = await findingByID(createdFindingId);
    expect(created).toEqual({
      id: createdFindingId,
      assetId: newAssetId,
      title: "Outdated openssl",
      severity: VulnerabilitySeverity.High,
      status: FindingStatus.Active,
      assigneeId: null,
      dueDate: null,
      mitigation: null,
      weakness: { identifiers: { cve: ["CVE-2026-0001"] } },
      affectedResource: { type: AffectedResourceType.Package, name: "openssl" },
      createdAt: expect.any(Date),
      updatedAt: created.createdAt,
      createdBy: actorId,
      updatedBy: actorId,
    });
    expect(created.createdAt.getTime()).toBeGreaterThanOrEqual(before);

    const observations = await testDb.db
      .selectFrom("observation")
      .selectAll()
      .orderBy("title")
      .execute();
    expect(observations).toEqual([
      expect.objectContaining({ findingId: createdFindingId, title: "Outdated openssl" }),
      expect.objectContaining({ findingId: createdFindingId, title: "Outdated openssl again" }),
      expect.objectContaining({ findingId: existingFindingId, title: "Seen again" }),
    ]);
    for (const row of observations) {
      expect(row).toMatchObject({
        ingestionId,
        source: ObservationSource.Trivy,
        weakness: { identifiers: { cve: ["CVE-2026-0001"] } },
        affectedResource: {
          type: AffectedResourceType.Package,
          ecosystem: "deb",
          name: "openssl",
          version: "3.0.1",
        },
        fingerprints: { trivy: ["a", "b"] },
        observedAt,
        createdAt: created.createdAt,
        updatedAt: created.createdAt,
        createdBy: actorId,
        updatedBy: actorId,
      });
    }

    expect(await findingByID(existingFindingId)).toMatchObject({
      status: FindingStatus.Active,
      updatedAt: created.createdAt,
      updatedBy: actorId,
      createdBy: editorId,
    });
    expect(
      await testDb.db
        .selectFrom("ingestion")
        .select(["status", "processedAt", "failureCode"])
        .where("id", "=", ingestionId)
        .executeTakeFirstOrThrow(),
    ).toEqual({ status: "completed", processedAt: created.createdAt, failureCode: null });
  });

  it.each([FindingStatus.Inactive, FindingStatus.Mitigated])(
    "reopens a %s finding without clearing its triage",
    async (status) => {
      const ingestionId = await insertIngestion();
      const assetId = await insertAsset("reopen.example.com");
      const findingId = await insertFinding(assetId, status);
      const previous = await findingByID(findingId);

      await expect(
        ingestions().record(ingestionId, {
          newFindings: [],
          attachments: [{ findingId, assetId, observations: [observation()] }],
        }),
      ).resolves.toEqual({
        status: "recorded",
        createdFindingIds: [],
        attachedObservations: 1,
        reopenedFindingIds: [findingId],
      });

      expect(await findingByID(findingId)).toEqual({
        ...previous,
        status: FindingStatus.Active,
        updatedAt: expect.any(Date),
        updatedBy: actorId,
      });
    },
  );

  it.each([
    FindingStatus.Active,
    FindingStatus.Confirmed,
    FindingStatus.FalsePositive,
    FindingStatus.RiskAccepted,
    FindingStatus.Duplicate,
    FindingStatus.OutOfScope,
  ])("keeps a %s finding's status and only touches it", async (status) => {
    const ingestionId = await insertIngestion();
    const assetId = await insertAsset("touch.example.com");
    const findingId = await insertFinding(assetId, status);
    const previous = await findingByID(findingId);

    await expect(
      ingestions().record(ingestionId, {
        newFindings: [],
        attachments: [{ findingId, assetId, observations: [observation()] }],
      }),
    ).resolves.toMatchObject({ status: "recorded", reopenedFindingIds: [] });

    const current = await findingByID(findingId);
    expect(current).toEqual({ ...previous, updatedAt: expect.any(Date), updatedBy: actorId });
    expect(current.updatedAt.getTime()).toBeGreaterThan(previous.updatedAt.getTime());
  });

  it("returns already processed on redelivery without writing", async () => {
    const ingestionId = await insertIngestion();
    const assetId = await insertAsset("redelivery.example.com");
    const findingId = await insertFinding(assetId);
    const plan: IngestionPlan = {
      newFindings: [
        {
          assetId,
          finding: {
            title: "New",
            severity: VulnerabilitySeverity.Low,
            weakness: { identifiers: {} },
            affectedResource: { type: AffectedResourceType.Unspecified },
          },
          observations: [observation()],
        },
      ],
      attachments: [{ findingId, assetId, observations: [observation()] }],
    };
    await ingestions().record(ingestionId, plan);
    const before = await snapshot();

    await expect(ingestions().record(ingestionId, plan)).resolves.toEqual({
      status: "already_processed",
    });
    expect(await snapshot()).toEqual(before);
  });

  it("records a redelivered plan only once when deliveries race", async () => {
    const ingestionId = await insertIngestion();
    const assetId = await insertAsset("race.example.com");
    const findingId = await insertFinding(assetId);
    const plan: IngestionPlan = {
      newFindings: [],
      attachments: [{ findingId, assetId, observations: [observation()] }],
    };

    const results = await Promise.all([
      ingestions().record(ingestionId, plan),
      ingestions().record(ingestionId, plan),
    ]);

    expect(results.map(({ status }) => status).sort()).toEqual(["already_processed", "recorded"]);
    expect((await snapshot()).observations).toHaveLength(1);
  });

  type DriftTarget = { findingId: string; otherAssetId: string };
  it.each([
    {
      drift: "the attached finding was deleted",
      apply: async ({ findingId }: DriftTarget) => {
        await testDb.db.deleteFrom("finding").where("id", "=", findingId).execute();
      },
    },
    {
      drift: "the attached finding moved to another asset",
      apply: async ({ findingId, otherAssetId }: DriftTarget) => {
        await testDb.db
          .updateTable("finding")
          .set({ assetId: otherAssetId })
          .where("id", "=", findingId)
          .execute();
      },
    },
    {
      drift: "the new finding's asset was deleted",
      apply: async ({ otherAssetId }: DriftTarget) => {
        await testDb.db.deleteFrom("asset").where("id", "=", otherAssetId).execute();
      },
    },
  ])("rejects a stale plan without writing when $drift", async ({ apply }) => {
    const ingestionId = await insertIngestion();
    const assetId = await insertAsset("drift.example.com");
    const otherAssetId = await insertAsset("other.example.com");
    const findingId = await insertFinding(assetId, FindingStatus.Inactive);
    const plan: IngestionPlan = {
      newFindings: [
        {
          assetId: otherAssetId,
          finding: {
            title: "New",
            severity: VulnerabilitySeverity.Low,
            weakness: { identifiers: {} },
            affectedResource: { type: AffectedResourceType.Unspecified },
          },
          observations: [observation()],
        },
      ],
      attachments: [{ findingId, assetId, observations: [observation()] }],
    };
    await apply({ findingId, otherAssetId });
    const before = await snapshot();

    await expect(ingestions().record(ingestionId, plan)).rejects.toMatchObject({
      code: "ingestion.plan_stale",
      kind: "conflict",
      details: { ingestionId },
    });
    expect(await snapshot()).toEqual(before);
  });

  it("rejects a plan that attaches one finding to two assets", async () => {
    const ingestionId = await insertIngestion();
    const assetId = await insertAsset("first.example.com");
    const otherAssetId = await insertAsset("second.example.com");
    const findingId = await insertFinding(assetId);
    const before = await snapshot();

    await expect(
      ingestions().record(ingestionId, {
        newFindings: [],
        attachments: [
          { findingId, assetId, observations: [observation()] },
          { findingId, assetId: otherAssetId, observations: [observation()] },
        ],
      }),
    ).rejects.toMatchObject({ code: "ingestion.plan_stale" });
    expect(await snapshot()).toEqual(before);
  });

  it("completes the ingestion for an empty plan", async () => {
    const ingestionId = await insertIngestion();

    await expect(
      ingestions().record(ingestionId, { newFindings: [], attachments: [] }),
    ).resolves.toEqual({
      status: "recorded",
      createdFindingIds: [],
      attachedObservations: 0,
      reopenedFindingIds: [],
    });
    expect((await snapshot()).ingestions).toEqual([
      expect.objectContaining({
        id: ingestionId,
        status: "completed",
        processedAt: expect.any(Date),
      }),
    ]);
  });

  it("leaves no partial rows when a write fails mid-transaction", async () => {
    const ingestionId = await insertIngestion();
    const assetId = await insertAsset("failure.example.com");
    const findingId = await insertFinding(assetId, FindingStatus.Mitigated);
    const before = await snapshot();
    let inserts = 0;
    const database = testDb.db.withPlugin({
      transformQuery({ node }) {
        if (node.kind === "InsertQueryNode" && ++inserts === 2) {
          throw new Error("private-database-credentials");
        }
        return node;
      },
      async transformResult({ result }) {
        return result;
      },
    });

    const error = await ingestions(database)
      .record(ingestionId, {
        newFindings: [
          {
            assetId,
            finding: {
              title: "New",
              severity: VulnerabilitySeverity.Low,
              weakness: { identifiers: {} },
              affectedResource: { type: AffectedResourceType.Unspecified },
            },
            observations: [observation()],
          },
        ],
        attachments: [{ findingId, assetId, observations: [observation()] }],
      })
      .catch((error: unknown) => error);

    expect(inserts).toBe(2);
    expect(error).toMatchObject({
      code: "ingestion.record_failed",
      kind: "unexpected",
      message: "Ingestion plan could not be recorded",
      details: { ingestionId },
      cause: undefined,
    });
    expect(await snapshot()).toEqual(before);
  });

  it("rejects an invalid plan before writing", async () => {
    const ingestionId = await insertIngestion();
    const assetId = await insertAsset("invalid.example.com");
    const before = await snapshot();

    await expect(
      ingestions().record(ingestionId, {
        newFindings: [
          {
            assetId,
            finding: {
              title: "No observations",
              severity: VulnerabilitySeverity.Low,
              weakness: { identifiers: {} },
              affectedResource: { type: AffectedResourceType.Unspecified },
            },
            observations: [],
          },
        ],
        attachments: [],
      }),
    ).rejects.toMatchObject({
      code: "ingestion.plan_invalid",
      kind: "validation",
      details: { ingestionId },
    });
    expect(await snapshot()).toEqual(before);
  });

  it("rejects an unknown ingestion", async () => {
    await expect(
      ingestions().record(unknownIngestionId, { newFindings: [], attachments: [] }),
    ).rejects.toMatchObject({
      code: "ingestion.not_found",
      kind: "missing",
      details: { ingestionId: unknownIngestionId },
    });
  });
});
