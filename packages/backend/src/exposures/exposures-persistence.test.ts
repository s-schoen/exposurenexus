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

import { createAssets } from "../assets/assets.js";
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

  it("round-trips finding corrections without rewriting observations or catalog enrichment", async () => {
    const asset = await createAsset("api.example.com");
    const vulnerability = await createVulnerability("unchanged-enrichment");
    const exposures = createCapability();
    const created = await createFinding(asset.id, "Original", [vulnerability.current.id]);
    const observations = await exposures.findings.listObservations(created.current.id);
    const updated = await exposures.findings.updateByID({
      id: created.current.id,
      finding: {
        title: "Corrected finding",
        severity: VulnerabilitySeverity.Critical,
        status: FindingStatus.Confirmed,
        assigneeId: auditUserId,
        dueDate: new Date("2026-07-12T16:30:00Z"),
        mitigation: "Restrict access",
        weakness: { identifiers: { cwe: ["cwe-79", "CWE-79"] } },
        affectedResource: { type: AffectedResourceType.WebEndpoint, path: "/admin", method: "GET" },
      },
      performedBy: auditUserId,
    });
    expect(updated).toMatchObject({
      previous: created.current,
      current: {
        title: "Corrected finding",
        severity: VulnerabilitySeverity.Critical,
        status: FindingStatus.Confirmed,
        assigneeId: auditUserId,
        dueDate: new Date("2026-07-12T00:00:00Z"),
        mitigation: "Restrict access",
        weakness: { identifiers: { cwe: ["CWE-79"] } },
        affectedResource: { type: AffectedResourceType.WebEndpoint, path: "/admin", method: "GET" },
        createdAt: created.current.createdAt,
        createdBy: auditUserId,
        updatedBy: auditUserId,
        vulnerabilities: created.current.vulnerabilities,
      },
    });
    await expect(exposures.findings.getByID(created.current.id)).resolves.toEqual(updated!.current);
    await expect(exposures.findings.listObservations(created.current.id)).resolves.toEqual(
      observations,
    );

    const statusOnly = await exposures.findings.updateByID({
      id: created.current.id,
      finding: { status: FindingStatus.Mitigated },
      performedBy: auditUserId,
    });
    expect(statusOnly!.current).toEqual({
      ...updated!.current,
      status: FindingStatus.Mitigated,
      updatedAt: expect.any(Date),
    });
    const cleared = await exposures.findings.updateByID({
      id: created.current.id,
      finding: { assigneeId: null, dueDate: null, mitigation: null },
      performedBy: auditUserId,
    });
    expect(cleared!.current).toEqual({
      ...statusOnly!.current,
      assigneeId: null,
      dueDate: null,
      mitigation: null,
      updatedAt: expect.any(Date),
    });
    await expect(exposures.findings.listAll()).resolves.toEqual([cleared!.current]);
  });

  it("blocks asset deletion until its findings are deleted and preserves catalog entries", async () => {
    const asset = await createAsset("api.example.com");
    const exposures = createCapability();
    const inventory = createAssets(createBackendRuntime({ database: testDb.db, logger })).inventory;
    const vulnerability = await createVulnerability("retained-catalog-entry");
    const finding = await createFinding(asset.id, "Blocking finding", [vulnerability.current.id]);
    await expect(
      inventory.deleteByID({ id: asset.id, performedBy: auditUserId }),
    ).rejects.toMatchObject({ code: "asset.delete_referenced_by_findings" });
    await expect(inventory.getByID(asset.id)).resolves.toEqual(asset);
    await expect(
      exposures.findings.deleteByID({ id: finding.current.id, performedBy: auditUserId }),
    ).resolves.toEqual({ previous: finding.current, performedBy: auditUserId });
    await expect(exposures.findings.getByID(finding.current.id)).resolves.toBeNull();
    await expect(exposures.findings.listObservations(finding.current.id)).resolves.toBeNull();
    await expect(exposures.findings.listAll()).resolves.toEqual([]);
    await expect(exposures.vulnerabilities.getByID(vulnerability.current.id)).resolves.toEqual(
      vulnerability.current,
    );
    await expect(exposures.statistics.getFindingStats()).resolves.toMatchObject({
      total: 0,
      assets: {},
    });
    await expect(
      inventory.deleteByID({ id: asset.id, performedBy: auditUserId }),
    ).resolves.toMatchObject({ asset, previous: { ...asset, customFields: [] } });
    await expect(inventory.getByID(asset.id)).resolves.toBeNull();
    await expect(
      inventory.deleteByID({ id: asset.id, performedBy: auditUserId }),
    ).resolves.toBeNull();
  });

  it("returns null for finding corrections and deletions after the finding is gone", async () => {
    const findings = createCapability().findings;
    const id = "5ae5fb17-4d54-43f6-b85c-02c0a087f503";
    await expect(
      findings.updateByID({ id, finding: { title: "Missing" }, performedBy: auditUserId }),
    ).resolves.toBeNull();
    await expect(findings.deleteByID({ id, performedBy: auditUserId })).resolves.toBeNull();
  });

  it("recomputes observation dates and preserves workflow when the last observation is removed", async () => {
    const asset = await createAsset("api.example.com");
    const findings = createCapability().findings;
    const created = await createFinding(asset.id, "Observed finding");
    const earlier = await findings.createManualObservation({
      findingId: created.current.id,
      observation: { observedAt: new Date("2020-01-01T00:00:00Z"), evidence: "Older scan" },
      performedBy: auditUserId,
    });
    expect(earlier).toMatchObject({
      observation: { title: "Observed finding", severity: VulnerabilitySeverity.High },
      currentFinding: {
        observationCount: 2,
        firstSeen: new Date("2020-01-01T00:00:00Z"),
        lastSeen: created.observation.observedAt,
      },
    });
    const corrected = await findings.updateObservation({
      findingId: created.current.id,
      observationId: earlier!.observation.id,
      observation: {
        observedAt: new Date("2099-01-01T00:00:00Z"),
        weakness: { identifiers: { cwe: ["cwe-79"] } },
        affectedResource: { type: AffectedResourceType.Package, name: "example", version: "1.0" },
      },
      performedBy: auditUserId,
    });
    expect(corrected).toMatchObject({
      observation: {
        weakness: { identifiers: { cwe: ["CWE-79"] } },
        affectedResource: { type: AffectedResourceType.Package, name: "example", version: "1.0" },
      },
      currentFinding: {
        firstSeen: created.observation.observedAt,
        lastSeen: new Date("2099-01-01T00:00:00Z"),
        weakness: created.current.weakness,
        affectedResource: created.current.affectedResource,
      },
    });
    await expect(findings.listObservations(created.current.id)).resolves.toEqual([
      corrected!.observation,
      created.observation,
    ]);
    await findings.deleteObservation({
      findingId: created.current.id,
      observationId: earlier!.observation.id,
      performedBy: auditUserId,
    });
    const emptied = await findings.deleteObservation({
      findingId: created.current.id,
      observationId: created.observation.id,
      performedBy: auditUserId,
    });
    expect(emptied!.currentFinding).toEqual({
      ...created.current,
      observationCount: 0,
      firstSeen: null,
      lastSeen: null,
      updatedAt: expect.any(Date),
    });
    await expect(findings.getByID(created.current.id)).resolves.toEqual(emptied!.currentFinding);
    await expect(findings.listObservations(created.current.id)).resolves.toEqual([]);
  });

  it("does not correct, delete, or move an observation through the wrong parent", async () => {
    const asset = await createAsset("api.example.com");
    const findings = createCapability().findings;
    const source = await createFinding(asset.id, "Source");
    const other = await createFinding(asset.id, "Other");
    const command = {
      findingId: other.current.id,
      observationId: source.observation.id,
      performedBy: auditUserId,
    };
    await expect(
      findings.updateObservation({ ...command, observation: { title: "Wrong parent" } }),
    ).resolves.toBeNull();
    await expect(findings.deleteObservation(command)).resolves.toBeNull();
    await expect(
      findings.moveObservation({ ...command, targetFindingId: source.current.id }),
    ).resolves.toBeNull();
    await expect(findings.getByID(source.current.id)).resolves.toEqual(source.current);
    await expect(findings.getByID(other.current.id)).resolves.toEqual(other.current);
    await expect(findings.listObservations(source.current.id)).resolves.toEqual([
      source.observation,
    ]);
    await expect(findings.listObservations(other.current.id)).resolves.toEqual([other.observation]);
  });

  it("returns null for observation mutations when a parent is missing", async () => {
    const findings = createCapability().findings;
    const asset = await createAsset("api.example.com");
    const source = await createFinding(asset.id, "Source");
    const missingId = "5ae5fb17-4d54-43f6-b85c-02c0a087f503";
    const command = {
      findingId: missingId,
      observationId: source.observation.id,
      performedBy: auditUserId,
    };
    await expect(
      findings.createManualObservation({ ...command, observation: {} }),
    ).resolves.toBeNull();
    await expect(
      findings.updateObservation({ ...command, observation: { title: "Missing" } }),
    ).resolves.toBeNull();
    await expect(findings.deleteObservation(command)).resolves.toBeNull();
    await expect(
      findings.moveObservation({ ...command, targetFindingId: source.current.id }),
    ).resolves.toBeNull();
    await expect(
      findings.moveObservation({
        ...command,
        findingId: source.current.id,
        targetFindingId: missingId,
      }),
    ).resolves.toBeNull();
    await expect(findings.getByID(source.current.id)).resolves.toEqual(source.current);
    await expect(findings.listObservations(source.current.id)).resolves.toEqual([
      source.observation,
    ]);
  });

  it.each(["update", "delete"] as const)(
    "rolls back observation %s when updating the parent audit fails",
    async (operation) => {
      const asset = await createAsset("api.example.com");
      const findings = createCapability().findings;
      const created = await createFinding(asset.id, "Original");
      const command = {
        findingId: created.current.id,
        observationId: created.observation.id,
        performedBy: auditUserId,
      };
      await expect(
        withFailingFindingUpdate(() =>
          operation === "update"
            ? findings.updateObservation({ ...command, observation: { title: "Must roll back" } })
            : findings.deleteObservation(command),
        ),
      ).rejects.toMatchObject({ code: `observation.${operation}_failed` });
      await expect(findings.getByID(created.current.id)).resolves.toEqual(created.current);
      await expect(findings.listObservations(created.current.id)).resolves.toEqual([
        created.observation,
      ]);
    },
  );

  it("rejects duplicate catalog identities on create and update without changing existing entries", async () => {
    const vulnerabilities = createCapability().vulnerabilities;
    const first = await createVulnerability("first");
    const second = await createVulnerability("second");
    const input = {
      type: VulnerabilityType.Custom,
      identifier: "first",
      title: "Conflicting",
      description: null,
      severity: VulnerabilitySeverity.Low,
      metadata: null,
    };
    await expect(
      vulnerabilities.create({ vulnerability: input, performedBy: auditUserId }),
    ).rejects.toMatchObject({ code: "vulnerability.identity_conflict" });
    await expect(
      vulnerabilities.updateByID({
        id: second.current.id,
        vulnerability: input,
        performedBy: auditUserId,
      }),
    ).rejects.toMatchObject({ code: "vulnerability.identity_conflict" });
    const entries = await vulnerabilities.listAll();
    expect(entries).toHaveLength(2);
    expect(entries).toEqual(expect.arrayContaining([first.current, second.current]));
  });

  it("returns null when reading, updating, or deleting a missing catalog entry", async () => {
    const vulnerabilities = createCapability().vulnerabilities;
    const missingId = "5ae5fb17-4d54-43f6-b85c-02c0a087f503";
    await expect(vulnerabilities.getByID(missingId)).resolves.toBeNull();
    await expect(
      vulnerabilities.updateByID({
        id: missingId,
        vulnerability: {
          type: VulnerabilityType.Custom,
          identifier: "missing",
          title: "Missing",
          description: null,
          severity: VulnerabilitySeverity.Low,
          metadata: null,
        },
        performedBy: auditUserId,
      }),
    ).resolves.toBeNull();
    await expect(
      vulnerabilities.deleteByID({ id: missingId, performedBy: auditUserId }),
    ).resolves.toBeNull();
    await expect(vulnerabilities.listAll()).resolves.toEqual([]);
  });

  it("rejects invalid catalog corrections without changing the entry", async () => {
    const vulnerabilities = createCapability().vulnerabilities;
    const created = await createVulnerability("original");
    await expect(
      vulnerabilities.updateByID({
        id: created.current.id,
        vulnerability: {
          type: VulnerabilityType.Cve,
          identifier: "invalid-cve",
          title: "Rejected",
          description: null,
          severity: VulnerabilitySeverity.Low,
          metadata: null,
        },
        performedBy: auditUserId,
      }),
    ).rejects.toMatchObject({ code: "vulnerability.invalid_input", kind: "validation" });
    await expect(vulnerabilities.getByID(created.current.id)).resolves.toEqual(created.current);
  });

  it.each(["create", "update"] as const)(
    "rejects catalog %s with a missing audit actor and preserves stored entries",
    async (operation) => {
      const vulnerabilities = createCapability().vulnerabilities;
      const created = await createVulnerability("original");
      const command = {
        vulnerability: {
          type: VulnerabilityType.Custom,
          identifier: "changed",
          title: "Rejected",
          description: null,
          severity: VulnerabilitySeverity.Low,
          metadata: null,
        },
        performedBy: "5ae5fb17-4d54-43f6-b85c-02c0a087f503",
      };
      await expect(
        operation === "create"
          ? vulnerabilities.create(command)
          : vulnerabilities.updateByID({ ...command, id: created.current.id }),
      ).rejects.toMatchObject({
        code: `vulnerability.${operation}_failed`,
        kind: "unexpected",
        cause: expect.any(Error),
      });
      await expect(vulnerabilities.listAll()).resolves.toEqual([created.current]);
    },
  );

  it.each(["list", "get", "create", "update", "delete"] as const)(
    "reports catalog %s database failures as typed application errors",
    async (operation) => {
      const vulnerabilities = createCapability().vulnerabilities;
      const created = await createVulnerability("original");
      const command = {
        id: created.current.id,
        vulnerability: {
          type: VulnerabilityType.Custom,
          identifier: "changed",
          title: "Changed",
          description: null,
          severity: VulnerabilitySeverity.Low,
          metadata: null,
        },
        performedBy: auditUserId,
      };
      const operations = {
        list: () => vulnerabilities.listAll(),
        get: () => vulnerabilities.getByID(created.current.id),
        create: () => vulnerabilities.create(command),
        update: () => vulnerabilities.updateByID(command),
        delete: () => vulnerabilities.deleteByID(command),
      };
      // Make the catalog unavailable without mocking the capability's private adapters.
      await sql`ALTER TABLE vulnerability RENAME TO unavailable_vulnerability`.execute(testDb.db);
      try {
        await expect(operations[operation]()).rejects.toMatchObject({
          code: `vulnerability.${operation}_failed`,
          kind: "unexpected",
          cause: expect.any(Error),
        });
      } finally {
        await sql`ALTER TABLE unavailable_vulnerability RENAME TO vulnerability`.execute(testDb.db);
      }
      await expect(vulnerabilities.listAll()).resolves.toEqual([created.current]);
    },
  );

  it("validates manual finding relationships before creating supporting records", async () => {
    const asset = await createAsset("api.example.com");
    const findings = createCapability().findings;
    const missingId = "5ae5fb17-4d54-43f6-b85c-02c0a087f503";
    await expect(createFinding(missingId, "Missing asset")).rejects.toMatchObject({
      code: "finding.asset_unknown",
    });
    await expect(
      createFinding(asset.id, "Missing vulnerability", [missingId]),
    ).rejects.toMatchObject({ code: "finding.vulnerability_unknown" });
    const input = {
      assetId: asset.id,
      title: "Assigned",
      dueDate: null,
      mitigation: null,
      severity: VulnerabilitySeverity.High,
      status: FindingStatus.Active,
      weakness: { identifiers: {} },
      affectedResource: { type: AffectedResourceType.Unspecified as const },
      vulnerabilityIds: [],
    };
    await expect(
      findings.createManual({
        finding: { ...input, assigneeId: missingId },
        performedBy: auditUserId,
      }),
    ).rejects.toMatchObject({ code: "finding.assignee_unknown" });
    await expect(findings.listAll()).resolves.toEqual([]);
    const created = await findings.createManual({
      finding: { ...input, assigneeId: auditUserId },
      performedBy: auditUserId,
    });
    expect(created.current.assigneeId).toBe(auditUserId);
    await expect(
      findings.updateByID({
        id: created.current.id,
        finding: { assigneeId: missingId },
        performedBy: auditUserId,
      }),
    ).rejects.toMatchObject({ code: "finding.assignee_unknown" });
    await expect(findings.getByID(created.current.id)).resolves.toEqual(created.current);
  });

  it("handles missing finding and vulnerability link targets without changing enrichment", async () => {
    const asset = await createAsset("api.example.com");
    const finding = await createFinding(asset.id, "Unlinked");
    const vulnerability = await createVulnerability("available");
    const findings = createCapability().findings;
    const missingId = "5ae5fb17-4d54-43f6-b85c-02c0a087f503";
    await expect(
      findings.linkVulnerability({
        findingId: missingId,
        vulnerabilityId: vulnerability.current.id,
        performedBy: auditUserId,
      }),
    ).resolves.toBeNull();
    await expect(
      findings.linkVulnerability({
        findingId: finding.current.id,
        vulnerabilityId: missingId,
        performedBy: auditUserId,
      }),
    ).rejects.toMatchObject({ code: "finding.vulnerability_link_target_missing" });
    await expect(findings.getByID(finding.current.id)).resolves.toEqual(finding.current);
  });

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

    await sql`ALTER TABLE observation ADD CONSTRAINT reject_atomic_test CHECK (title <> 'Atomic manual finding')`.execute(
      testDb.db,
    );
    try {
      await expect(
        createFinding(asset.id, "Atomic manual finding", [vulnerability.current.id]),
      ).rejects.toMatchObject({ code: "finding.manual_create_failed" });
      await expect(testDb.db.selectFrom("finding").selectAll().execute()).resolves.toEqual([]);
      await expect(testDb.db.selectFrom("observation").selectAll().execute()).resolves.toEqual([]);
    } finally {
      await sql`ALTER TABLE observation DROP CONSTRAINT reject_atomic_test`.execute(testDb.db);
    }

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
