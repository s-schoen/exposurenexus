import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import {
  AssetEnvironment,
  AssetLifecycleState,
  AssetType,
} from "@exposurenexus/contracts/model/asset";
import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { ObservationSource } from "@exposurenexus/contracts/model/observation";
import {
  VulnerabilitySeverity,
  VulnerabilityType,
} from "@exposurenexus/contracts/model/vulnerability";
import { sql } from "kysely";
import { pino } from "pino";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createTestDatabase,
  insertTestAsset,
  resetTestDatabase,
} from "../database/test/database.js";
import { createBackendRuntime } from "../runtime.js";
import { createExposures } from "./exposures.js";

const auditUserId = "85196743-cfba-4afb-b286-d36be32a64a4";

describe("exposures capability persistence", () => {
  const testDb = createTestDatabase();
  const logger = pino({ enabled: false });

  beforeAll(async () => {
    await testDb.start();
  });

  afterAll(async () => {
    await testDb.dispose();
  });

  beforeEach(async () => {
    await resetTestDatabase(testDb.db);
    await testDb.db
      .insertInto("user_profile")
      .values({
        id: auditUserId,
        username: "exposures-persistence-tester",
        displayName: "Exposures Persistence Tester",
        email: "exposures-persistence@example.com",
        enabled: true,
        passwordHash: "password-hash",
      })
      .execute();
  });

  function createCapability() {
    return createExposures(createBackendRuntime({ database: testDb.db, logger }));
  }

  async function createAsset(displayName: string) {
    const timestamp = new Date("2026-01-01T00:00:00.000Z");
    return await insertTestAsset(testDb.db, {
      displayName,
      type: AssetType.Host,
      environment: AssetEnvironment.Production,
      lifecycleState: AssetLifecycleState.Active,
      ownerId: null,
      identifiers: [],
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: auditUserId,
      updatedBy: auditUserId,
    });
  }

  async function createVulnerability(identifier: string) {
    return await createCapability().vulnerabilities.create({
      vulnerability: {
        type: VulnerabilityType.Custom,
        identifier,
        title: identifier,
        description: null,
        severity: VulnerabilitySeverity.High,
        metadata: null,
      },
      performedBy: auditUserId,
    });
  }

  async function createFinding(
    assetId: string,
    title: string,
    vulnerabilityIds: readonly string[] = [],
  ) {
    return await createCapability().findings.createManual({
      finding: {
        assetId,
        title,
        severity: VulnerabilitySeverity.High,
        status: FindingStatus.Active,
        assigneeId: null,
        dueDate: null,
        mitigation: null,
        weakness: { identifiers: {} },
        affectedResource: { type: AffectedResourceType.Unspecified },
        vulnerabilityIds: [...vulnerabilityIds],
      },
      performedBy: auditUserId,
    });
  }

  async function withFailingFindingUpdate<T>(action: () => Promise<T>): Promise<T> {
    await sql`
      CREATE FUNCTION fail_exposure_finding_update() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'exposure finding update failed';
      END;
      $$
    `.execute(testDb.db);
    await sql`
      CREATE TRIGGER fail_exposure_finding_update_trigger
      BEFORE UPDATE ON finding
      FOR EACH ROW EXECUTE FUNCTION fail_exposure_finding_update()
    `.execute(testDb.db);

    try {
      return await action();
    } finally {
      await sql`DROP TRIGGER fail_exposure_finding_update_trigger ON finding`.execute(testDb.db);
      await sql`DROP FUNCTION fail_exposure_finding_update`.execute(testDb.db);
    }
  }

  it("keeps manual creation, projections, links, and statistics on the capability seam", async () => {
    const asset = await createAsset("api.exposurenexus.local");
    const vulnerability = await createVulnerability("admin-panel");
    const exposures = createCapability();

    const created = await createFinding(asset.id, "Exposed admin panel", [
      vulnerability.current.id,
    ]);

    expect(created.current).toMatchObject({
      id: expect.any(String),
      title: "Exposed admin panel",
      observationCount: 1,
      firstSeen: expect.any(Date),
      lastSeen: expect.any(Date),
      weakness: { identifiers: {} },
      affectedResource: { type: AffectedResourceType.Unspecified },
      vulnerabilities: [{ id: vulnerability.current.id }],
    });
    const emptyFinding = await testDb.db
      .insertInto("finding")
      .values({
        assetId: asset.id,
        title: "Empty finding",
        severity: VulnerabilitySeverity.Low,
        status: FindingStatus.Active,
        assigneeId: null,
        dueDate: null,
        mitigation: null,
        weakness: { identifiers: {} },
        affectedResource: { type: AffectedResourceType.Unspecified },
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        createdBy: auditUserId,
        updatedBy: auditUserId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await expect(exposures.findings.getByID(emptyFinding.id)).resolves.toMatchObject({
      id: emptyFinding.id,
      observationCount: 0,
      firstSeen: null,
      lastSeen: null,
      vulnerabilities: [],
    });
    await expect(exposures.findings.listObservations(created.current.id)).resolves.toMatchObject([
      {
        findingId: created.current.id,
        source: ObservationSource.Manual,
      },
    ]);
    await expect(exposures.statistics.getFindingStats()).resolves.toMatchObject({
      total: 2,
      assets: { [asset.id]: 2 },
    });

    const auditBeforeNoOp = await testDb.db
      .selectFrom("finding")
      .select(["updatedAt", "updatedBy"])
      .where("id", "=", created.current.id)
      .executeTakeFirstOrThrow();
    await expect(
      exposures.findings.linkVulnerability({
        findingId: created.current.id,
        vulnerabilityId: vulnerability.current.id,
        performedBy: auditUserId,
      }),
    ).resolves.toMatchObject({ changed: false });
    await expect(
      testDb.db
        .selectFrom("finding")
        .select(["updatedAt", "updatedBy"])
        .where("id", "=", created.current.id)
        .executeTakeFirstOrThrow(),
    ).resolves.toEqual(auditBeforeNoOp);

    await expect(
      exposures.findings.unlinkVulnerability({
        findingId: created.current.id,
        vulnerabilityId: vulnerability.current.id,
        performedBy: auditUserId,
      }),
    ).resolves.toMatchObject({
      changed: true,
      link: { vulnerabilityId: vulnerability.current.id },
    });
    await expect(exposures.findings.getByID(created.current.id)).resolves.toMatchObject({
      vulnerabilities: [],
    });

    await expect(
      exposures.findings.linkVulnerability({
        findingId: created.current.id,
        vulnerabilityId: vulnerability.current.id,
        performedBy: auditUserId,
      }),
    ).resolves.toMatchObject({ changed: true });
    await expect(
      exposures.vulnerabilities.updateByID({
        id: vulnerability.current.id,
        vulnerability: {
          type: VulnerabilityType.Custom,
          identifier: "admin-panel",
          title: "Updated admin panel",
          description: null,
          severity: VulnerabilitySeverity.Critical,
          metadata: { source: "test" },
        },
        performedBy: auditUserId,
      }),
    ).resolves.toMatchObject({ current: { title: "Updated admin panel" } });
    await expect(
      exposures.vulnerabilities.deleteByID({
        id: vulnerability.current.id,
        performedBy: auditUserId,
      }),
    ).resolves.toMatchObject({ previous: { id: vulnerability.current.id } });
    await expect(exposures.vulnerabilities.getByID(vulnerability.current.id)).resolves.toBeNull();
    await expect(exposures.findings.getByID(created.current.id)).resolves.toMatchObject({
      vulnerabilities: [],
    });
  });

  it("locks both parents and returns complete observation move facts", async () => {
    const asset = await createAsset("api.exposurenexus.local");
    const exposures = createCapability();
    const source = await createFinding(asset.id, "Source finding");
    const target = await createFinding(asset.id, "Target finding");
    const sourceObservation = (await exposures.findings.listObservations(source.current.id))![0]!;

    const moved = await exposures.findings.moveObservation({
      findingId: source.current.id,
      observationId: sourceObservation.id,
      targetFindingId: target.current.id,
      performedBy: auditUserId,
    });

    expect(moved).toMatchObject({
      previousObservation: sourceObservation,
      observation: { id: sourceObservation.id, findingId: target.current.id },
      sourcePrevious: { id: source.current.id, observationCount: 1 },
      sourceCurrent: {
        id: source.current.id,
        observationCount: 0,
        updatedBy: auditUserId,
        updatedAt: expect.any(Date),
      },
      targetPrevious: { id: target.current.id, observationCount: 1 },
      targetCurrent: {
        id: target.current.id,
        observationCount: 2,
        updatedBy: auditUserId,
        updatedAt: expect.any(Date),
      },
    });
    await expect(exposures.findings.listObservations(source.current.id)).resolves.toEqual([]);
    const targetObservations = await exposures.findings.listObservations(target.current.id);
    expect(targetObservations).toHaveLength(2);

    const updated = await exposures.findings.updateObservation({
      findingId: target.current.id,
      observationId: moved!.observation.id,
      observation: { title: "Corrected moved observation" },
      performedBy: auditUserId,
    });
    expect(updated).toMatchObject({
      previousObservation: moved!.observation,
      observation: { title: "Corrected moved observation", findingId: target.current.id },
      currentFinding: { observationCount: 2, updatedBy: auditUserId },
    });

    await expect(
      exposures.findings.deleteObservation({
        findingId: target.current.id,
        observationId: moved!.observation.id,
        performedBy: auditUserId,
      }),
    ).resolves.toMatchObject({
      observation: { id: moved!.observation.id },
      currentFinding: { observationCount: 1, updatedBy: auditUserId },
    });
    await expect(exposures.findings.listObservations(target.current.id)).resolves.toHaveLength(1);
  });

  it("rolls back manual creation, observation transitions, and links as one unit", async () => {
    const asset = await createAsset("api.exposurenexus.local");
    const vulnerability = await createVulnerability("duplicate-link");
    const exposures = createCapability();

    await expect(
      createFinding(asset.id, "Atomic manual finding", [
        vulnerability.current.id,
        vulnerability.current.id,
      ]),
    ).rejects.toMatchObject({ code: "finding.manual_create_failed" });
    await expect(testDb.db.selectFrom("finding").selectAll().execute()).resolves.toEqual([]);
    await expect(testDb.db.selectFrom("observation").selectAll().execute()).resolves.toEqual([]);

    const finding = await createFinding(asset.id, "Rollback finding");
    const observationsBefore = await exposures.findings.listObservations(finding.current.id);
    const target = await createFinding(asset.id, "Rollback target");
    const targetObservationsBefore = await exposures.findings.listObservations(target.current.id);
    await expect(
      withFailingFindingUpdate(() =>
        exposures.findings.createManualObservation({
          findingId: finding.current.id,
          observation: { evidence: "must roll back" },
          performedBy: auditUserId,
        }),
      ),
    ).rejects.toMatchObject({ code: "observation.create_failed" });
    await expect(exposures.findings.listObservations(finding.current.id)).resolves.toEqual(
      observationsBefore,
    );
    await expect(
      withFailingFindingUpdate(() =>
        exposures.findings.moveObservation({
          findingId: finding.current.id,
          observationId: observationsBefore![0]!.id,
          targetFindingId: target.current.id,
          performedBy: auditUserId,
        }),
      ),
    ).rejects.toMatchObject({ code: "observation.move_failed" });
    await expect(exposures.findings.listObservations(finding.current.id)).resolves.toEqual(
      observationsBefore,
    );
    await expect(exposures.findings.listObservations(target.current.id)).resolves.toEqual(
      targetObservationsBefore,
    );

    await expect(
      withFailingFindingUpdate(() =>
        exposures.findings.linkVulnerability({
          findingId: finding.current.id,
          vulnerabilityId: vulnerability.current.id,
          performedBy: auditUserId,
        }),
      ),
    ).rejects.toMatchObject({ code: "finding.vulnerability_link_failed" });
    await expect(exposures.findings.getByID(finding.current.id)).resolves.toMatchObject({
      vulnerabilities: [],
    });
  });
});
