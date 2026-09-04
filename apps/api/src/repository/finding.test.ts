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
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, insertTestAsset, resetTestDatabase } from "../test/db.js";
import { createFindingRepository } from "./finding.js";
import { createObservationRepository } from "./observation.js";
import { createVulnerabilityRepository } from "./vulnerability.js";

describe("observation-based persistence repositories", () => {
  const testDb = createTestDatabase();
  const createdBy = "85196743-cfba-4afb-b286-d36be32a64a4";

  function assetRecord(displayName: string) {
    const timestamp = new Date("2026-01-01T00:00:00.000Z");

    return {
      displayName,
      type: AssetType.Host,
      environment: AssetEnvironment.Production,
      lifecycleState: AssetLifecycleState.Active,
      ownerId: null,
      identifiers: [],
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
      updatedBy: createdBy,
    };
  }

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
        id: createdBy,
        username: "tester",
        displayName: "Test User",
        email: "tester@example.com",
        enabled: true,
        passwordHash: "password-hash",
      })
      .execute();
  });

  it("round-trips finding and observation JSON values with nullable ingestion", async () => {
    const asset = await insertTestAsset(testDb.db, assetRecord("api.exposurenexus.local"));
    const findingRepository = createFindingRepository(testDb.db);
    const observationRepository = createObservationRepository(testDb.db);
    const timestamp = new Date("2026-01-03T00:00:00.000Z");

    const finding = await findingRepository.create({
      assetId: asset.id,
      title: "Exposed admin endpoint",
      severity: VulnerabilitySeverity.High,
      status: FindingStatus.Active,
      assigneeId: null,
      dueDate: null,
      mitigation: "Restrict access to trusted networks",
      weakness: { identifiers: { CVE: [" cve-2026-0001 "] } },
      affectedResource: {
        type: AffectedResourceType.WebEndpoint,
        scheme: "HTTPS",
        host: "EXAMPLE.com",
        path: "/admin/../login",
      },
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
      updatedBy: createdBy,
    });

    expect(finding.weakness).toEqual({ identifiers: { cve: ["CVE-2026-0001"] } });
    expect(finding.affectedResource).toEqual({
      type: AffectedResourceType.WebEndpoint,
      scheme: "HTTPS",
      host: "EXAMPLE.com",
      path: "/admin/../login",
    });
    await expect(findingRepository.getByID(finding.id)).resolves.toEqual(finding);

    const ingestion = await testDb.db
      .insertInto("ingestion")
      .values({ source: "nuclei", createdAt: timestamp, createdBy })
      .returningAll()
      .executeTakeFirstOrThrow();
    const importedObservation = await observationRepository.create({
      findingId: finding.id,
      ingestionId: ingestion.id,
      source: ObservationSource.Nuclei,
      title: "Admin endpoint detected",
      description: "The endpoint is reachable.",
      evidence: "GET /login returned 200",
      remediation: "Require authentication",
      severity: VulnerabilitySeverity.High,
      weakness: { identifiers: { nuclei: ["admin-panel"] } },
      affectedResource: {
        type: AffectedResourceType.WebEndpoint,
        reportedUrl: "https://EXAMPLE.com:443/login",
        scheme: "https",
        host: "example.com",
        path: "/login",
      },
      observedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
      updatedBy: createdBy,
    });
    const manualObservation = await observationRepository.create({
      id: "2713d833-eb13-4517-ac7c-7761545ed42a",
      findingId: finding.id,
      ingestionId: null,
      source: ObservationSource.Manual,
      title: "Manual confirmation",
      description: null,
      evidence: null,
      remediation: null,
      severity: VulnerabilitySeverity.Medium,
      weakness: { identifiers: {} },
      affectedResource: { type: AffectedResourceType.Unspecified },
      observedAt: new Date("2026-01-04T00:00:00.000Z"),
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
      updatedBy: createdBy,
    });
    expect(importedObservation).toMatchObject({
      ingestionId: ingestion.id,
      affectedResource: { reportedUrl: "https://EXAMPLE.com:443/login" },
    });
    expect(manualObservation).toMatchObject({
      ingestionId: null,
      affectedResource: { type: AffectedResourceType.Unspecified },
    });
    await expect(observationRepository.getByID(importedObservation.id)).resolves.toEqual(
      importedObservation,
    );
    await expect(observationRepository.getByID(manualObservation.id)).resolves.toEqual(
      manualObservation,
    );
  });

  it("orders observations by observed time and id", async () => {
    const asset = await insertTestAsset(testDb.db, assetRecord("api.exposurenexus.local"));
    const findingRepository = createFindingRepository(testDb.db);
    const observationRepository = createObservationRepository(testDb.db);
    const timestamp = new Date("2026-01-03T00:00:00.000Z");
    const finding = await findingRepository.create({
      assetId: asset.id,
      title: "Exposed admin endpoint",
      severity: VulnerabilitySeverity.High,
      status: FindingStatus.Active,
      assigneeId: null,
      dueDate: null,
      mitigation: null,
      weakness: { identifiers: {} },
      affectedResource: { type: AffectedResourceType.Unspecified },
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
      updatedBy: createdBy,
    });
    const baseObservation = {
      findingId: finding.id,
      ingestionId: null,
      source: ObservationSource.Manual,
      description: null,
      evidence: null,
      remediation: null,
      severity: VulnerabilitySeverity.Medium,
      weakness: { identifiers: {} },
      affectedResource: { type: AffectedResourceType.Unspecified },
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
      updatedBy: createdBy,
    };
    const earlierObservation = await observationRepository.create({
      ...baseObservation,
      id: "2713d833-eb13-4517-ac7c-7761545ed42a",
      title: "Earlier observation",
      observedAt: new Date("2026-01-03T00:00:00.000Z"),
    });
    const laterObservation = await observationRepository.create({
      ...baseObservation,
      id: "2713d833-eb13-4517-ac7c-7761545ed42b",
      title: "Later observation",
      observedAt: new Date("2026-01-04T00:00:00.000Z"),
    });
    const tiedObservation = await observationRepository.create({
      ...baseObservation,
      id: "2713d833-eb13-4517-ac7c-7761545ed42c",
      title: "Later deterministic ID",
      observedAt: new Date("2026-01-04T00:00:00.000Z"),
    });

    await expect(observationRepository.listByFindingID(finding.id)).resolves.toEqual([
      tiedObservation,
      laterObservation,
      earlierObservation,
    ]);
  });

  it("creates an observation and touches its parent finding atomically", async () => {
    const asset = await insertTestAsset(testDb.db, assetRecord("api.exposurenexus.local"));
    const findingRepository = createFindingRepository(testDb.db);
    const observationRepository = createObservationRepository(testDb.db);
    const originalTime = new Date("2026-08-16T10:00:00.000Z");
    const updateTime = new Date("2026-08-17T10:00:00.000Z");
    const finding = await findingRepository.create({
      assetId: asset.id,
      title: "Canonical title",
      severity: VulnerabilitySeverity.High,
      status: FindingStatus.Active,
      assigneeId: null,
      dueDate: null,
      mitigation: null,
      weakness: { identifiers: { cwe: ["CWE-200"] } },
      affectedResource: { type: AffectedResourceType.Unspecified },
      createdAt: originalTime,
      updatedAt: originalTime,
      createdBy,
      updatedBy: createdBy,
    });
    const observationInput = {
      findingId: finding.id,
      ingestionId: null,
      source: ObservationSource.Manual,
      title: "Manual confirmation",
      description: null,
      evidence: "GET /admin returned 200",
      remediation: null,
      severity: VulnerabilitySeverity.Low,
      weakness: { identifiers: { custom: ["manual-check"] } },
      affectedResource: { type: AffectedResourceType.Unspecified },
      observedAt: updateTime,
      createdAt: updateTime,
      updatedAt: updateTime,
      createdBy,
      updatedBy: createdBy,
    };

    const created = await observationRepository.createAndTouchFinding({
      findingId: finding.id,
      buildObservation(previous) {
        expect(previous).toMatchObject({
          id: finding.id,
          title: "Canonical title",
          observationCount: 0,
          updatedAt: originalTime,
        });
        return observationInput;
      },
    });

    expect(created).toMatchObject({
      observation: observationInput,
      previous: {
        id: finding.id,
        observationCount: 0,
        updatedAt: originalTime,
      },
      current: {
        id: finding.id,
        observationCount: 1,
        updatedAt: updateTime,
        updatedBy: createdBy,
      },
    });
    await expect(findingRepository.getByID(finding.id)).resolves.toMatchObject({
      title: "Canonical title",
      severity: VulnerabilitySeverity.High,
      weakness: { identifiers: { cwe: ["CWE-200"] } },
      updatedAt: updateTime,
      updatedBy: createdBy,
    });
  });

  it("rolls back an observation when touching its parent projection fails", async () => {
    const asset = await insertTestAsset(testDb.db, assetRecord("api.exposurenexus.local"));
    const findingRepository = createFindingRepository(testDb.db);
    const observationRepository = createObservationRepository(testDb.db);
    const originalTime = new Date("2026-08-16T10:00:00.000Z");
    const updateTime = new Date("2026-08-17T10:00:00.000Z");
    const finding = await findingRepository.create({
      assetId: asset.id,
      title: "Canonical title",
      severity: VulnerabilitySeverity.High,
      status: FindingStatus.Active,
      assigneeId: null,
      dueDate: null,
      mitigation: null,
      weakness: { identifiers: { cwe: ["CWE-200"] } },
      affectedResource: { type: AffectedResourceType.Unspecified },
      createdAt: originalTime,
      updatedAt: originalTime,
      createdBy,
      updatedBy: createdBy,
    });
    const observationInput = {
      findingId: finding.id,
      ingestionId: null,
      source: ObservationSource.Manual,
      title: "Initial observation",
      description: null,
      evidence: null,
      remediation: null,
      severity: VulnerabilitySeverity.Low,
      weakness: { identifiers: {} },
      affectedResource: { type: AffectedResourceType.Unspecified },
      observedAt: updateTime,
      createdAt: updateTime,
      updatedAt: updateTime,
      createdBy,
      updatedBy: createdBy,
    };
    const created = await observationRepository.createAndTouchFinding({
      findingId: finding.id,
      buildObservation: () => observationInput,
    });

    await sql`
      create function fail_finding_touch() returns trigger as $$
      begin
        raise exception 'finding touch failed';
      end;
      $$ language plpgsql
    `.execute(testDb.db);
    // Raise during the parent touch after the observation insert to exercise rollback.
    await sql`
      create trigger fail_finding_touch
      before update on finding
      for each row execute function fail_finding_touch()
    `.execute(testDb.db);

    try {
      await expect(
        observationRepository.createAndTouchFinding({
          findingId: finding.id,
          buildObservation: () => ({
            ...observationInput,
            title: "Must roll back",
            updatedAt: new Date("2026-08-18T10:00:00.000Z"),
          }),
        }),
      ).rejects.toThrow("finding touch failed");
      await expect(observationRepository.listByFindingID(finding.id)).resolves.toEqual([
        created?.observation,
      ]);
      await expect(findingRepository.getByID(finding.id)).resolves.toMatchObject({
        title: "Canonical title",
        updatedAt: updateTime,
      });
    } finally {
      await sql`drop trigger fail_finding_touch on finding`.execute(testDb.db);
      await sql`drop function fail_finding_touch()`.execute(testDb.db);
    }
  });

  it("updates an observation and preserves omitted fields while refreshing the parent", async () => {
    const asset = await insertTestAsset(testDb.db, assetRecord("api.exposurenexus.local"));
    const findingRepository = createFindingRepository(testDb.db);
    const observationRepository = createObservationRepository(testDb.db);
    const originalTime = new Date("2026-08-16T10:00:00.000Z");
    const updateTime = new Date("2026-08-17T10:00:00.000Z");
    const finding = await findingRepository.create({
      assetId: asset.id,
      title: "Canonical title",
      severity: VulnerabilitySeverity.High,
      status: FindingStatus.Confirmed,
      assigneeId: null,
      dueDate: null,
      mitigation: "Keep the endpoint protected",
      weakness: { identifiers: { cwe: ["CWE-200"] } },
      affectedResource: { type: AffectedResourceType.WebEndpoint, path: "/admin" },
      createdAt: originalTime,
      updatedAt: originalTime,
      createdBy,
      updatedBy: createdBy,
    });
    const observation = await observationRepository.create({
      findingId: finding.id,
      ingestionId: null,
      source: ObservationSource.Manual,
      title: "Original observation",
      description: "Original description",
      evidence: "Original evidence",
      remediation: "Original remediation",
      severity: VulnerabilitySeverity.High,
      weakness: { identifiers: { cwe: ["CWE-200"] } },
      affectedResource: {
        type: AffectedResourceType.WebEndpoint,
        host: "example.com",
        path: "/admin",
        reportedUrl: "https://example.com/admin",
      },
      observedAt: originalTime,
      createdAt: originalTime,
      updatedAt: originalTime,
      createdBy,
      updatedBy: createdBy,
    });

    const updated = await observationRepository.updateAndTouchFinding({
      findingId: finding.id,
      observationId: observation.id,
      observation: {
        title: "Corrected observation",
        description: null,
        evidence: "Corrected evidence",
        remediation: null,
        severity: VulnerabilitySeverity.Medium,
        weakness: { identifiers: { cwe: ["CWE-89"] } },
        affectedResource: {
          type: AffectedResourceType.SourceCode,
          file: "src/query.ts",
        },
        observedAt: updateTime,
        updatedAt: updateTime,
        updatedBy: createdBy,
      },
    });

    expect(updated).toMatchObject({
      previousObservation: observation,
      observation: {
        title: "Corrected observation",
        description: null,
        evidence: "Corrected evidence",
        remediation: null,
        severity: VulnerabilitySeverity.Medium,
        weakness: { identifiers: { cwe: ["CWE-89"] } },
        affectedResource: { type: AffectedResourceType.SourceCode, file: "src/query.ts" },
        observedAt: updateTime,
        updatedAt: updateTime,
        updatedBy: createdBy,
      },
      previous: { observationCount: 1, firstSeen: originalTime, lastSeen: originalTime },
      current: {
        observationCount: 1,
        firstSeen: updateTime,
        lastSeen: updateTime,
        updatedAt: updateTime,
        updatedBy: createdBy,
      },
    });

    const preserved = await observationRepository.updateAndTouchFinding({
      findingId: finding.id,
      observationId: observation.id,
      observation: {
        title: "Preserved observation details",
        updatedAt: new Date("2026-08-17T11:00:00.000Z"),
        updatedBy: createdBy,
      },
    });

    expect(preserved?.observation).toMatchObject({
      title: "Preserved observation details",
      description: null,
      evidence: "Corrected evidence",
      remediation: null,
      severity: VulnerabilitySeverity.Medium,
      weakness: { identifiers: { cwe: ["CWE-89"] } },
      affectedResource: { type: AffectedResourceType.SourceCode, file: "src/query.ts" },
      observedAt: updateTime,
    });
  });

  it("deletes the final observation and refreshes an empty parent projection", async () => {
    const asset = await insertTestAsset(testDb.db, assetRecord("api.exposurenexus.local"));
    const findingRepository = createFindingRepository(testDb.db);
    const observationRepository = createObservationRepository(testDb.db);
    const originalTime = new Date("2026-08-16T10:00:00.000Z");
    const finding = await findingRepository.create({
      assetId: asset.id,
      title: "Canonical title",
      severity: VulnerabilitySeverity.High,
      status: FindingStatus.Confirmed,
      assigneeId: null,
      dueDate: null,
      mitigation: "Keep the endpoint protected",
      weakness: { identifiers: { cwe: ["CWE-200"] } },
      affectedResource: { type: AffectedResourceType.WebEndpoint, path: "/admin" },
      createdAt: originalTime,
      updatedAt: originalTime,
      createdBy,
      updatedBy: createdBy,
    });
    const observation = await observationRepository.create({
      findingId: finding.id,
      ingestionId: null,
      source: ObservationSource.Manual,
      title: "Original observation",
      description: "Original description",
      evidence: "Original evidence",
      remediation: "Original remediation",
      severity: VulnerabilitySeverity.High,
      weakness: { identifiers: { cwe: ["CWE-200"] } },
      affectedResource: {
        type: AffectedResourceType.WebEndpoint,
        host: "example.com",
        path: "/admin",
        reportedUrl: "https://example.com/admin",
      },
      observedAt: originalTime,
      createdAt: originalTime,
      updatedAt: originalTime,
      createdBy,
      updatedBy: createdBy,
    });

    const deleted = await observationRepository.deleteAndTouchFinding({
      findingId: finding.id,
      observationId: observation.id,
      updatedAt: new Date("2026-08-18T10:00:00.000Z"),
      updatedBy: createdBy,
    });

    expect(deleted).toMatchObject({
      observation,
      current: {
        observationCount: 0,
        firstSeen: null,
        lastSeen: null,
        updatedBy: createdBy,
      },
    });
    await expect(findingRepository.getProjectedByID(finding.id)).resolves.toMatchObject({
      status: FindingStatus.Confirmed,
      title: "Canonical title",
      observationCount: 0,
      firstSeen: null,
      lastSeen: null,
      updatedBy: createdBy,
    });
    await expect(observationRepository.listByFindingID(finding.id)).resolves.toEqual([]);
  });

  it("moves an observation and refreshes both parent projections atomically", async () => {
    const movedBy = "bd093c13-6daf-42ce-8e8d-36716818fd8f";
    await testDb.db
      .insertInto("user_profile")
      .values({
        id: movedBy,
        username: "mover",
        displayName: "Move User",
        email: "mover@example.com",
        enabled: true,
        passwordHash: "password-hash",
      })
      .execute();
    const asset = await insertTestAsset(testDb.db, assetRecord("api.exposurenexus.local"));
    const findingRepository = createFindingRepository(testDb.db);
    const observationRepository = createObservationRepository(testDb.db);
    const originalTime = new Date("2026-08-16T10:00:00.000Z");
    const updateTime = new Date("2026-08-17T10:00:00.000Z");
    const sourceFinding = await findingRepository.create({
      assetId: asset.id,
      title: "Source finding",
      severity: VulnerabilitySeverity.High,
      status: FindingStatus.Confirmed,
      assigneeId: null,
      dueDate: null,
      mitigation: "Keep the endpoint protected",
      weakness: { identifiers: { cwe: ["CWE-200"] } },
      affectedResource: { type: AffectedResourceType.WebEndpoint, path: "/admin" },
      createdAt: originalTime,
      updatedAt: originalTime,
      createdBy,
      updatedBy: createdBy,
    });
    const targetFinding = await findingRepository.create({
      assetId: asset.id,
      title: "Target finding",
      severity: VulnerabilitySeverity.Medium,
      status: FindingStatus.Active,
      assigneeId: null,
      dueDate: null,
      mitigation: null,
      weakness: { identifiers: { cwe: ["CWE-89"] } },
      affectedResource: { type: AffectedResourceType.SourceCode, file: "src/query.ts" },
      createdAt: originalTime,
      updatedAt: originalTime,
      createdBy,
      updatedBy: createdBy,
    });
    const observation = await observationRepository.create({
      findingId: sourceFinding.id,
      ingestionId: null,
      source: ObservationSource.Manual,
      title: "Moved observation",
      description: null,
      evidence: "Evidence",
      remediation: null,
      severity: VulnerabilitySeverity.High,
      weakness: { identifiers: { cwe: ["CWE-200"] } },
      affectedResource: { type: AffectedResourceType.Unspecified },
      observedAt: new Date("2026-08-15T10:00:00.000Z"),
      createdAt: originalTime,
      updatedAt: originalTime,
      createdBy,
      updatedBy: createdBy,
    });

    const moved = await observationRepository.moveAndTouchFindings({
      findingId: sourceFinding.id,
      observationId: observation.id,
      targetFindingId: targetFinding.id,
      updatedAt: updateTime,
      updatedBy: movedBy,
    });

    expect(moved).toMatchObject({
      previousObservation: observation,
      observation: {
        ...observation,
        findingId: targetFinding.id,
        updatedAt: updateTime,
        updatedBy: movedBy,
      },
      sourcePrevious: { id: sourceFinding.id, observationCount: 1 },
      sourceCurrent: {
        id: sourceFinding.id,
        title: "Source finding",
        observationCount: 0,
        firstSeen: null,
        lastSeen: null,
        updatedAt: updateTime,
        updatedBy: movedBy,
      },
      targetPrevious: { id: targetFinding.id, observationCount: 0 },
      targetCurrent: {
        id: targetFinding.id,
        title: "Target finding",
        observationCount: 1,
        firstSeen: observation.observedAt,
        lastSeen: observation.observedAt,
        updatedAt: updateTime,
        updatedBy: movedBy,
      },
    });
    await expect(observationRepository.listByFindingID(sourceFinding.id)).resolves.toEqual([]);
    await expect(observationRepository.listByFindingID(targetFinding.id)).resolves.toEqual([
      moved?.observation,
    ]);
    await expect(findingRepository.getProjectedByID(sourceFinding.id)).resolves.toMatchObject({
      title: "Source finding",
      severity: VulnerabilitySeverity.High,
      weakness: { identifiers: { cwe: ["CWE-200"] } },
      observationCount: 0,
      updatedAt: updateTime,
      updatedBy: movedBy,
    });
    await expect(findingRepository.getProjectedByID(targetFinding.id)).resolves.toMatchObject({
      title: "Target finding",
      severity: VulnerabilitySeverity.Medium,
      weakness: { identifiers: { cwe: ["CWE-89"] } },
      observationCount: 1,
      updatedAt: updateTime,
      updatedBy: movedBy,
    });
  });

  it("does not move a missing observation", async () => {
    const asset = await insertTestAsset(testDb.db, assetRecord("api.exposurenexus.local"));
    const findingRepository = createFindingRepository(testDb.db);
    const observationRepository = createObservationRepository(testDb.db);
    const timestamp = new Date("2026-08-16T10:00:00.000Z");
    const sourceFinding = await findingRepository.create({
      assetId: asset.id,
      title: "Source finding",
      severity: VulnerabilitySeverity.High,
      status: FindingStatus.Active,
      assigneeId: null,
      dueDate: null,
      mitigation: null,
      weakness: { identifiers: {} },
      affectedResource: { type: AffectedResourceType.Unspecified },
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
      updatedBy: createdBy,
    });
    const targetFinding = await findingRepository.create({
      assetId: asset.id,
      title: "Target finding",
      severity: VulnerabilitySeverity.Low,
      status: FindingStatus.Active,
      assigneeId: null,
      dueDate: null,
      mitigation: null,
      weakness: { identifiers: {} },
      affectedResource: { type: AffectedResourceType.Unspecified },
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
      updatedBy: createdBy,
    });

    await expect(
      observationRepository.moveAndTouchFindings({
        findingId: sourceFinding.id,
        observationId: "2713d833-eb13-4517-ac7c-7761545ed42a",
        targetFindingId: targetFinding.id,
        updatedAt: new Date("2026-08-17T10:00:00.000Z"),
        updatedBy: createdBy,
      }),
    ).resolves.toBeNull();
  });

  it("does not move an observation to a missing target finding", async () => {
    const asset = await insertTestAsset(testDb.db, assetRecord("api.exposurenexus.local"));
    const findingRepository = createFindingRepository(testDb.db);
    const observationRepository = createObservationRepository(testDb.db);
    const timestamp = new Date("2026-08-16T10:00:00.000Z");
    const sourceFinding = await findingRepository.create({
      assetId: asset.id,
      title: "Source finding",
      severity: VulnerabilitySeverity.High,
      status: FindingStatus.Active,
      assigneeId: null,
      dueDate: null,
      mitigation: null,
      weakness: { identifiers: {} },
      affectedResource: { type: AffectedResourceType.Unspecified },
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
      updatedBy: createdBy,
    });
    const observation = await observationRepository.create({
      findingId: sourceFinding.id,
      ingestionId: null,
      source: ObservationSource.Manual,
      title: "Original observation",
      description: null,
      evidence: null,
      remediation: null,
      severity: VulnerabilitySeverity.High,
      weakness: { identifiers: {} },
      affectedResource: { type: AffectedResourceType.Unspecified },
      observedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
      updatedBy: createdBy,
    });

    await expect(
      observationRepository.moveAndTouchFindings({
        findingId: sourceFinding.id,
        observationId: observation.id,
        targetFindingId: "2713d833-eb13-4517-ac7c-7761545ed42b",
        updatedAt: new Date("2026-08-17T10:00:00.000Z"),
        updatedBy: createdBy,
      }),
    ).resolves.toBeNull();
    await expect(observationRepository.listByFindingID(sourceFinding.id)).resolves.toEqual([
      observation,
    ]);
  });

  it("rolls back the observation relationship and both parent audits when a parent update fails", async () => {
    const asset = await insertTestAsset(testDb.db, assetRecord("api.exposurenexus.local"));
    const findingRepository = createFindingRepository(testDb.db);
    const observationRepository = createObservationRepository(testDb.db);
    const originalTime = new Date("2026-08-16T10:00:00.000Z");
    const updateTime = new Date("2026-08-17T10:00:00.000Z");
    const sourceFinding = await findingRepository.create({
      assetId: asset.id,
      title: "Source finding",
      severity: VulnerabilitySeverity.High,
      status: FindingStatus.Active,
      assigneeId: null,
      dueDate: null,
      mitigation: null,
      weakness: { identifiers: {} },
      affectedResource: { type: AffectedResourceType.Unspecified },
      createdAt: originalTime,
      updatedAt: originalTime,
      createdBy,
      updatedBy: createdBy,
    });
    const targetFinding = await findingRepository.create({
      assetId: asset.id,
      title: "Target finding",
      severity: VulnerabilitySeverity.Low,
      status: FindingStatus.Active,
      assigneeId: null,
      dueDate: null,
      mitigation: null,
      weakness: { identifiers: {} },
      affectedResource: { type: AffectedResourceType.Unspecified },
      createdAt: originalTime,
      updatedAt: originalTime,
      createdBy,
      updatedBy: createdBy,
    });
    const observation = await observationRepository.create({
      findingId: sourceFinding.id,
      ingestionId: null,
      source: ObservationSource.Manual,
      title: "Original observation",
      description: null,
      evidence: null,
      remediation: null,
      severity: VulnerabilitySeverity.High,
      weakness: { identifiers: {} },
      affectedResource: { type: AffectedResourceType.Unspecified },
      observedAt: originalTime,
      createdAt: originalTime,
      updatedAt: originalTime,
      createdBy,
      updatedBy: createdBy,
    });

    await sql`
      create function fail_target_finding_update() returns trigger as $$
      begin
        if new.title = 'Target finding' then
          raise exception 'target finding update failed';
        end if;
        return new;
      end;
      $$ language plpgsql
    `.execute(testDb.db);
    // Reject the target parent touch so the relationship and both audits must roll back.
    await sql`
      create trigger fail_target_finding_update
      before update on finding
      for each row execute function fail_target_finding_update()
    `.execute(testDb.db);

    try {
      await expect(
        observationRepository.moveAndTouchFindings({
          findingId: sourceFinding.id,
          observationId: observation.id,
          targetFindingId: targetFinding.id,
          updatedAt: updateTime,
          updatedBy: createdBy,
        }),
      ).rejects.toThrow("target finding update failed");
      await expect(observationRepository.listByFindingID(sourceFinding.id)).resolves.toEqual([
        observation,
      ]);
      await expect(observationRepository.listByFindingID(targetFinding.id)).resolves.toEqual([]);
      await expect(findingRepository.getProjectedByID(sourceFinding.id)).resolves.toMatchObject({
        observationCount: 1,
        updatedAt: originalTime,
      });
      await expect(findingRepository.getProjectedByID(targetFinding.id)).resolves.toMatchObject({
        observationCount: 0,
        updatedAt: originalTime,
      });
    } finally {
      await sql`drop trigger fail_target_finding_update on finding`.execute(testDb.db);
      await sql`drop function fail_target_finding_update()`.execute(testDb.db);
    }
  });

  it("builds ordered finding projections with observations and catalog links", async () => {
    const asset = await insertTestAsset(testDb.db, assetRecord("api.exposurenexus.local"));
    const findingRepository = createFindingRepository(testDb.db);
    const observationRepository = createObservationRepository(testDb.db);
    const vulnerabilityRepository = createVulnerabilityRepository(testDb.db);
    const timestamp = new Date("2026-01-03T00:00:00.000Z");
    const finding = await findingRepository.create({
      assetId: asset.id,
      title: "Exposed admin endpoint",
      severity: VulnerabilitySeverity.High,
      status: FindingStatus.Active,
      assigneeId: null,
      dueDate: null,
      mitigation: "Restrict access to trusted networks",
      weakness: { identifiers: { cwe: ["CWE-200"] } },
      affectedResource: {
        type: AffectedResourceType.WebEndpoint,
        scheme: "https",
        host: "example.com",
        path: "/admin",
      },
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
      updatedBy: createdBy,
    });
    const emptyFinding = await findingRepository.create({
      assetId: asset.id,
      title: "Unspecified weakness",
      severity: VulnerabilitySeverity.Info,
      status: FindingStatus.Active,
      assigneeId: null,
      dueDate: null,
      mitigation: null,
      weakness: { identifiers: {} },
      affectedResource: { type: AffectedResourceType.Unspecified },
      createdAt: new Date("2026-01-04T00:00:00.000Z"),
      updatedAt: new Date("2026-01-04T00:00:00.000Z"),
      createdBy,
      updatedBy: createdBy,
    });
    const cwe = await vulnerabilityRepository.create({
      type: VulnerabilityType.Cwe,
      identifier: "CWE-200",
      title: "Exposure of Sensitive Information",
      description: null,
      severity: VulnerabilitySeverity.Medium,
      metadata: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
      updatedBy: createdBy,
    });
    const cve = await vulnerabilityRepository.create({
      type: VulnerabilityType.Cve,
      identifier: "CVE-2026-0001",
      title: "Example endpoint exposure",
      description: "Catalog description",
      severity: VulnerabilitySeverity.High,
      metadata: { cvss: 8.1 },
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
      updatedBy: createdBy,
    });
    await testDb.db
      .insertInto("finding_vulnerability")
      .values([
        { findingId: finding.id, vulnerabilityId: cwe.id },
        { findingId: finding.id, vulnerabilityId: cve.id },
      ])
      .execute();
    const ingestion = await testDb.db
      .insertInto("ingestion")
      .values({ source: "nuclei", createdAt: timestamp, createdBy })
      .returningAll()
      .executeTakeFirstOrThrow();
    await observationRepository.create({
      findingId: finding.id,
      ingestionId: ingestion.id,
      source: ObservationSource.Nuclei,
      title: "Nuclei detection",
      description: null,
      evidence: null,
      remediation: null,
      severity: VulnerabilitySeverity.High,
      weakness: { identifiers: { nuclei: ["admin-panel"] } },
      affectedResource: {
        type: AffectedResourceType.WebEndpoint,
        reportedUrl: "https://EXAMPLE.com/admin",
        scheme: "https",
        host: "example.com",
        path: "/admin",
      },
      observedAt: new Date("2026-01-05T00:00:00.000Z"),
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
      updatedBy: createdBy,
    });
    await observationRepository.create({
      findingId: finding.id,
      ingestionId: null,
      source: ObservationSource.Manual,
      title: "Manual confirmation",
      description: null,
      evidence: null,
      remediation: null,
      severity: VulnerabilitySeverity.High,
      weakness: { identifiers: {} },
      affectedResource: { type: AffectedResourceType.Unspecified },
      observedAt: new Date("2026-01-04T00:00:00.000Z"),
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
      updatedBy: createdBy,
    });

    const projections = await findingRepository.listProjected();
    const projectedFinding = projections.find((item) => item.id === finding.id);
    const projectedEmptyFinding = projections.find((item) => item.id === emptyFinding.id);

    expect(projections.map((item) => item.id)).toEqual([emptyFinding.id, finding.id]);
    expect(projectedFinding).toMatchObject({
      id: finding.id,
      title: finding.title,
      observationCount: 2,
      firstSeen: new Date("2026-01-04T00:00:00.000Z"),
      lastSeen: new Date("2026-01-05T00:00:00.000Z"),
    });
    expect(
      projectedFinding?.vulnerabilities.map(({ type, identifier }) => ({ type, identifier })),
    ).toEqual([
      { type: VulnerabilityType.Cve, identifier: "CVE-2026-0001" },
      { type: VulnerabilityType.Cwe, identifier: "CWE-200" },
    ]);
    expect(projectedEmptyFinding).toMatchObject({
      id: emptyFinding.id,
      observationCount: 0,
      firstSeen: null,
      lastSeen: null,
      vulnerabilities: [],
    });
    await expect(findingRepository.getProjectedByID(finding.id)).resolves.toEqual(projectedFinding);
  });

  it("counts findings by status", async () => {
    const asset = await insertTestAsset(testDb.db, assetRecord("api.exposurenexus.local"));
    const repository = createFindingRepository(testDb.db);
    const timestamp = new Date("2026-01-03T00:00:00.000Z");
    for (const [id, status] of [
      ["2713d833-eb13-4517-ac7c-7761545ed42a", FindingStatus.Active],
      ["2713d833-eb13-4517-ac7c-7761545ed42b", FindingStatus.Confirmed],
    ] as const) {
      await repository.create({
        id,
        assetId: asset.id,
        title: `${status} finding`,
        severity: VulnerabilitySeverity.Low,
        status,
        assigneeId: null,
        dueDate: null,
        mitigation: null,
        weakness: { identifiers: {} },
        affectedResource: { type: AffectedResourceType.Unspecified },
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy,
        updatedBy: createdBy,
      });
    }

    await expect(repository.countBy("status")).resolves.toEqual({
      [FindingStatus.Active]: 1,
      [FindingStatus.Confirmed]: 1,
    });
  });

  it("replaces JSON identity values and preserves finding-owned persistence boundaries", async () => {
    const asset = await insertTestAsset(testDb.db, assetRecord("api.exposurenexus.local"));
    const repository = createFindingRepository(testDb.db);
    const timestamp = new Date("2026-01-03T00:00:00.000Z");
    const finding = await repository.create({
      assetId: asset.id,
      title: "Weakness",
      severity: VulnerabilitySeverity.Low,
      status: FindingStatus.Active,
      assigneeId: null,
      dueDate: null,
      mitigation: null,
      weakness: { identifiers: { cve: ["CVE-2026-0001"] } },
      affectedResource: { type: AffectedResourceType.Unspecified },
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
      updatedBy: createdBy,
    });

    const updated = await repository.updateByID(finding.id, {
      weakness: { identifiers: { cwe: ["CWE-89"] } },
      affectedResource: { type: AffectedResourceType.SourceCode, file: "src/db.ts" },
    });

    expect(updated).toMatchObject({
      weakness: { identifiers: { cwe: ["CWE-89"] } },
      affectedResource: { type: AffectedResourceType.SourceCode, file: "src/db.ts" },
    });
  });

  it("links a vulnerability once and makes retries idempotent", async () => {
    const asset = await insertTestAsset(testDb.db, assetRecord("api.exposurenexus.local"));
    const findingRepository = createFindingRepository(testDb.db);
    const vulnerabilityRepository = createVulnerabilityRepository(testDb.db);
    const timestamp = new Date("2026-01-03T00:00:00.000Z");
    const linkedAt = new Date("2026-01-04T00:00:00.000Z");
    const finding = await findingRepository.create({
      assetId: asset.id,
      title: "Weakness",
      severity: VulnerabilitySeverity.Low,
      status: FindingStatus.Active,
      assigneeId: null,
      dueDate: null,
      mitigation: null,
      weakness: { identifiers: {} },
      affectedResource: { type: AffectedResourceType.Unspecified },
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
      updatedBy: createdBy,
    });
    const vulnerability = await vulnerabilityRepository.create({
      type: VulnerabilityType.Custom,
      identifier: "weakness",
      title: "Weakness",
      description: null,
      severity: VulnerabilitySeverity.Low,
      metadata: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
      updatedBy: createdBy,
    });
    await expect(
      findingRepository.linkVulnerability({
        findingId: finding.id,
        vulnerabilityId: vulnerability.id,
        updatedAt: linkedAt,
        updatedBy: createdBy,
      }),
    ).resolves.toEqual({
      link: { findingId: finding.id, vulnerabilityId: vulnerability.id },
      changed: true,
    });
    await expect(
      findingRepository.linkVulnerability({
        findingId: finding.id,
        vulnerabilityId: vulnerability.id,
        updatedAt: new Date("2026-01-05T00:00:00.000Z"),
        updatedBy: createdBy,
      }),
    ).resolves.toEqual({
      link: { findingId: finding.id, vulnerabilityId: vulnerability.id },
      changed: false,
    });
    await expect(findingRepository.getByID(finding.id)).resolves.toMatchObject({
      updatedAt: linkedAt,
      updatedBy: createdBy,
    });
    await expect(
      testDb.db
        .selectFrom("finding_vulnerability")
        .selectAll()
        .where("findingId", "=", finding.id)
        .execute(),
    ).resolves.toEqual([{ findingId: finding.id, vulnerabilityId: vulnerability.id }]);
  });

  it("unlinks a vulnerability once and makes retries idempotent", async () => {
    const asset = await insertTestAsset(testDb.db, assetRecord("api.exposurenexus.local"));
    const findingRepository = createFindingRepository(testDb.db);
    const vulnerabilityRepository = createVulnerabilityRepository(testDb.db);
    const timestamp = new Date("2026-01-03T00:00:00.000Z");
    const linkedAt = new Date("2026-01-04T00:00:00.000Z");
    const unlinkedAt = new Date("2026-01-05T00:00:00.000Z");
    const finding = await findingRepository.create({
      assetId: asset.id,
      title: "Weakness",
      severity: VulnerabilitySeverity.Low,
      status: FindingStatus.Active,
      assigneeId: null,
      dueDate: null,
      mitigation: null,
      weakness: { identifiers: {} },
      affectedResource: { type: AffectedResourceType.Unspecified },
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
      updatedBy: createdBy,
    });
    const vulnerability = await vulnerabilityRepository.create({
      type: VulnerabilityType.Custom,
      identifier: "weakness",
      title: "Weakness",
      description: null,
      severity: VulnerabilitySeverity.Low,
      metadata: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
      updatedBy: createdBy,
    });
    await findingRepository.linkVulnerability({
      findingId: finding.id,
      vulnerabilityId: vulnerability.id,
      updatedAt: linkedAt,
      updatedBy: createdBy,
    });

    await expect(
      findingRepository.unlinkVulnerability({
        findingId: finding.id,
        vulnerabilityId: vulnerability.id,
        updatedAt: unlinkedAt,
        updatedBy: createdBy,
      }),
    ).resolves.toEqual({
      link: { findingId: finding.id, vulnerabilityId: vulnerability.id },
      changed: true,
    });
    await expect(
      findingRepository.unlinkVulnerability({
        findingId: finding.id,
        vulnerabilityId: vulnerability.id,
        updatedAt: new Date("2026-01-06T00:00:00.000Z"),
        updatedBy: createdBy,
      }),
    ).resolves.toEqual({ link: null, changed: false });
    await expect(findingRepository.getByID(finding.id)).resolves.toMatchObject({
      updatedAt: unlinkedAt,
      updatedBy: createdBy,
    });
    await expect(
      testDb.db
        .selectFrom("finding_vulnerability")
        .selectAll()
        .where("findingId", "=", finding.id)
        .execute(),
    ).resolves.toEqual([]);
  });

  it("rolls back a vulnerability link when the parent audit update fails", async () => {
    const asset = await insertTestAsset(testDb.db, assetRecord("api.exposurenexus.local"));
    const findingRepository = createFindingRepository(testDb.db);
    const vulnerabilityRepository = createVulnerabilityRepository(testDb.db);
    const timestamp = new Date("2026-01-03T00:00:00.000Z");
    const finding = await findingRepository.create({
      assetId: asset.id,
      title: "Weakness",
      severity: VulnerabilitySeverity.Low,
      status: FindingStatus.Active,
      assigneeId: null,
      dueDate: null,
      mitigation: null,
      weakness: { identifiers: {} },
      affectedResource: { type: AffectedResourceType.Unspecified },
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
      updatedBy: createdBy,
    });
    const vulnerability = await vulnerabilityRepository.create({
      type: VulnerabilityType.Custom,
      identifier: "weakness",
      title: "Weakness",
      description: null,
      severity: VulnerabilitySeverity.Low,
      metadata: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
      updatedBy: createdBy,
    });

    await sql`
      create function fail_link_finding_update() returns trigger as $$
      begin
        raise exception 'finding update failed';
      end;
      $$ language plpgsql
    `.execute(testDb.db);
    // Reject the parent audit update so the new link must roll back.
    await sql`
      create trigger fail_link_finding_update
      before update on finding
      for each row execute function fail_link_finding_update()
    `.execute(testDb.db);

    try {
      await expect(
        findingRepository.linkVulnerability({
          findingId: finding.id,
          vulnerabilityId: vulnerability.id,
          updatedAt: new Date("2026-01-06T00:00:00.000Z"),
          updatedBy: createdBy,
        }),
      ).rejects.toThrow("finding update failed");
      await expect(
        testDb.db
          .selectFrom("finding_vulnerability")
          .selectAll()
          .where("findingId", "=", finding.id)
          .execute(),
      ).resolves.toEqual([]);
    } finally {
      await sql`drop trigger fail_link_finding_update on finding`.execute(testDb.db);
      await sql`drop function fail_link_finding_update()`.execute(testDb.db);
    }
  });

  it("rolls back a vulnerability unlink when the audit actor is invalid", async () => {
    const asset = await insertTestAsset(testDb.db, assetRecord("api.exposurenexus.local"));
    const findingRepository = createFindingRepository(testDb.db);
    const vulnerabilityRepository = createVulnerabilityRepository(testDb.db);
    const timestamp = new Date("2026-01-03T00:00:00.000Z");
    const finding = await findingRepository.create({
      assetId: asset.id,
      title: "Weakness",
      severity: VulnerabilitySeverity.Low,
      status: FindingStatus.Active,
      assigneeId: null,
      dueDate: null,
      mitigation: null,
      weakness: { identifiers: {} },
      affectedResource: { type: AffectedResourceType.Unspecified },
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
      updatedBy: createdBy,
    });
    const vulnerability = await vulnerabilityRepository.create({
      type: VulnerabilityType.Custom,
      identifier: "weakness",
      title: "Weakness",
      description: null,
      severity: VulnerabilitySeverity.Low,
      metadata: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
      updatedBy: createdBy,
    });
    await findingRepository.linkVulnerability({
      findingId: finding.id,
      vulnerabilityId: vulnerability.id,
      updatedAt: new Date("2026-01-04T00:00:00.000Z"),
      updatedBy: createdBy,
    });
    await expect(
      findingRepository.unlinkVulnerability({
        findingId: finding.id,
        vulnerabilityId: vulnerability.id,
        updatedAt: new Date("2026-01-07T00:00:00.000Z"),
        updatedBy: vulnerability.id,
      }),
    ).rejects.toThrow();
    await expect(
      testDb.db
        .selectFrom("finding_vulnerability")
        .selectAll()
        .where("findingId", "=", finding.id)
        .execute(),
    ).resolves.toEqual([{ findingId: finding.id, vulnerabilityId: vulnerability.id }]);
  });

  it("cascades observations and catalog links when a finding is deleted", async () => {
    const asset = await insertTestAsset(testDb.db, assetRecord("api.exposurenexus.local"));
    const findingRepository = createFindingRepository(testDb.db);
    const observationRepository = createObservationRepository(testDb.db);
    const vulnerabilityRepository = createVulnerabilityRepository(testDb.db);
    const timestamp = new Date("2026-01-03T00:00:00.000Z");
    const finding = await findingRepository.create({
      assetId: asset.id,
      title: "Weakness",
      severity: VulnerabilitySeverity.Low,
      status: FindingStatus.Active,
      assigneeId: null,
      dueDate: null,
      mitigation: null,
      weakness: { identifiers: {} },
      affectedResource: { type: AffectedResourceType.Unspecified },
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
      updatedBy: createdBy,
    });
    const vulnerability = await vulnerabilityRepository.create({
      type: VulnerabilityType.Custom,
      identifier: "weakness",
      title: "Weakness",
      description: null,
      severity: VulnerabilitySeverity.Low,
      metadata: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
      updatedBy: createdBy,
    });
    await findingRepository.linkVulnerability({
      findingId: finding.id,
      vulnerabilityId: vulnerability.id,
      updatedAt: timestamp,
      updatedBy: createdBy,
    });
    await observationRepository.create({
      findingId: finding.id,
      ingestionId: null,
      source: ObservationSource.Manual,
      title: "Manual observation",
      description: null,
      evidence: null,
      remediation: null,
      severity: VulnerabilitySeverity.Low,
      weakness: { identifiers: {} },
      affectedResource: { type: AffectedResourceType.Unspecified },
      observedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
      updatedBy: createdBy,
    });

    await findingRepository.deleteByID(finding.id);

    await expect(observationRepository.listByFindingID(finding.id)).resolves.toEqual([]);
    await expect(
      testDb.db
        .selectFrom("finding_vulnerability")
        .selectAll()
        .where("findingId", "=", finding.id)
        .execute(),
    ).resolves.toEqual([]);
    await expect(vulnerabilityRepository.getByID(vulnerability.id)).resolves.toEqual(vulnerability);
  });

  it("creates a manual finding, observation, and links atomically", async () => {
    const asset = await insertTestAsset(testDb.db, assetRecord("api.exposurenexus.local"));
    const findingRepository = createFindingRepository(testDb.db);
    const vulnerabilityRepository = createVulnerabilityRepository(testDb.db);
    const timestamp = new Date("2026-01-03T00:00:00.000Z");
    const vulnerability = await vulnerabilityRepository.create({
      type: VulnerabilityType.Custom,
      identifier: "exposed-admin-panel",
      title: "Exposed admin panel",
      description: null,
      severity: VulnerabilitySeverity.High,
      metadata: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
      updatedBy: createdBy,
    });

    const created = await findingRepository.createManual({
      finding: {
        assetId: asset.id,
        title: "Exposed admin panel",
        severity: VulnerabilitySeverity.High,
        status: FindingStatus.Active,
        assigneeId: null,
        dueDate: null,
        mitigation: "Require authentication",
        weakness: { identifiers: {} },
        affectedResource: { type: AffectedResourceType.Unspecified },
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy,
        updatedBy: createdBy,
      },
      observation: {
        ingestionId: null,
        source: ObservationSource.Manual,
        title: "Admin panel observed",
        description: "Manual confirmation",
        evidence: "GET /admin returned 200",
        remediation: "Require authentication",
        severity: VulnerabilitySeverity.High,
        weakness: { identifiers: {} },
        affectedResource: {
          type: AffectedResourceType.WebEndpoint,
          reportedUrl: "https://EXAMPLE.com:443/admin",
          scheme: "https",
          host: "example.com",
          path: "/admin",
        },
        observedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy,
        updatedBy: createdBy,
      },
      vulnerabilityIds: [vulnerability.id],
    });

    expect(created.finding.title).toBe("Exposed admin panel");
    expect(created.observation.affectedResource).toMatchObject({
      type: AffectedResourceType.WebEndpoint,
      reportedUrl: "https://EXAMPLE.com:443/admin",
    });
    expect(created.links).toEqual([
      { findingId: created.finding.id, vulnerabilityId: vulnerability.id },
    ]);
    expect(created.projection).toMatchObject({
      id: created.finding.id,
      observationCount: 1,
      vulnerabilities: [{ id: vulnerability.id }],
    });
    await expect(findingRepository.getProjectedByID(created.finding.id)).resolves.toMatchObject({
      id: created.finding.id,
      observationCount: 1,
      vulnerabilities: [{ id: vulnerability.id }],
    });

    const { id: _findingId, ...findingInput } = created.finding;
    const { id: _observationId, findingId: _parentId, ...observationInput } = created.observation;
    const withoutVulnerabilities = await findingRepository.createManual({
      finding: { ...findingInput, title: "Manual finding without catalog links" },
      observation: observationInput,
      vulnerabilityIds: [],
    });
    expect(withoutVulnerabilities.links).toEqual([]);
    expect(withoutVulnerabilities.projection.vulnerabilities).toEqual([]);
  });

  it("rolls back the finding and observation when a catalog link fails", async () => {
    const asset = await insertTestAsset(testDb.db, assetRecord("api.exposurenexus.local"));
    const findingRepository = createFindingRepository(testDb.db);
    const timestamp = new Date("2026-01-03T00:00:00.000Z");

    await expect(
      findingRepository.createManual({
        finding: {
          assetId: asset.id,
          title: "Atomic failure",
          severity: VulnerabilitySeverity.Low,
          status: FindingStatus.Active,
          assigneeId: null,
          dueDate: null,
          mitigation: null,
          weakness: { identifiers: {} },
          affectedResource: { type: AffectedResourceType.Unspecified },
          createdAt: timestamp,
          updatedAt: timestamp,
          createdBy,
          updatedBy: createdBy,
        },
        observation: {
          ingestionId: null,
          source: ObservationSource.Manual,
          title: "Atomic failure",
          description: null,
          evidence: null,
          remediation: null,
          severity: VulnerabilitySeverity.Low,
          weakness: { identifiers: {} },
          affectedResource: { type: AffectedResourceType.Unspecified },
          observedAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp,
          createdBy,
          updatedBy: createdBy,
        },
        vulnerabilityIds: ["9d7acdd0-fad1-46c9-8218-1793f421f0fe"],
      }),
    ).rejects.toThrow();

    await expect(findingRepository.list()).resolves.toEqual([]);
  });
});
