import { AffectedResourceType } from "@exposurenexus/types/model/affected-resource";
import { AssetEnvironment, AssetLifecycleState, AssetType } from "@exposurenexus/types/model/asset";
import { FindingStatus } from "@exposurenexus/types/model/finding";
import { IngestionSource } from "@exposurenexus/types/model/ingestion";
import { ObservationSource } from "@exposurenexus/types/model/observation";
import { VulnerabilitySeverity, VulnerabilityType } from "@exposurenexus/types/model/vulnerability";
import { sql } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDatabase, resetTestDatabase } from "../test/db.js";
import { createAssetRepository } from "./asset.js";
import { createFindingPersistenceRepository } from "./finding-persistence.js";
import { createFindingVulnerabilityRepository } from "./finding-vulnerability.js";
import { createIngestionRepository } from "./ingestion.js";
import { createObservationRepository } from "./observation.js";
import { createVulnerabilityPersistenceRepository } from "./vulnerability-persistence.js";

vi.mock("../db/index.js", () => ({
  db: {},
  logger: {},
  pool: {},
}));

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

  it("round-trips validated JSON identity values and nullable observation ingestion", async () => {
    const asset = await createAssetRepository(testDb.db).create(
      assetRecord("api.exposurenexus.local"),
    );
    const findingRepository = createFindingPersistenceRepository(testDb.db);
    const observationRepository = createObservationRepository(testDb.db);
    const ingestionRepository = createIngestionRepository(testDb.db);
    const vulnerabilityRepository = createVulnerabilityPersistenceRepository(testDb.db);
    const linkRepository = createFindingVulnerabilityRepository(testDb.db);
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

    const vulnerability = await vulnerabilityRepository.create({
      type: VulnerabilityType.Cve,
      identifier: "CVE-2026-0001",
      title: "Example vulnerability",
      description: null,
      severity: VulnerabilitySeverity.High,
      metadata: { cvss: 8.1 },
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
      updatedBy: createdBy,
    });
    await expect(
      linkRepository.create({ findingId: finding.id, vulnerabilityId: vulnerability.id }),
    ).resolves.toEqual({
      findingId: finding.id,
      vulnerabilityId: vulnerability.id,
    });

    const ingestion = await ingestionRepository.create({
      source: IngestionSource.Nuclei,
      scope: { target: "example.com" },
      createdAt: timestamp,
      createdBy,
      processed: 1,
      createdObservations: 1,
      skipped: 0,
      errors: 0,
    });
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
      affectedResource: { type: AffectedResourceType.Asset },
      observedAt: new Date("2026-01-04T00:00:00.000Z"),
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
      updatedBy: createdBy,
    });
    const tiedObservation = await observationRepository.create({
      id: "2713d833-eb13-4517-ac7c-7761545ed42b",
      findingId: finding.id,
      ingestionId: null,
      source: ObservationSource.Manual,
      title: "Later deterministic ID",
      description: null,
      evidence: null,
      remediation: null,
      severity: VulnerabilitySeverity.Medium,
      weakness: { identifiers: {} },
      affectedResource: { type: AffectedResourceType.Asset },
      observedAt: new Date("2026-01-04T00:00:00.000Z"),
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
      updatedBy: createdBy,
    });

    expect(importedObservation.affectedResource).toMatchObject({
      reportedUrl: "https://EXAMPLE.com:443/login",
    });
    await expect(observationRepository.listByFindingID(finding.id)).resolves.toEqual([
      tiedObservation,
      manualObservation,
      importedObservation,
    ]);
    await expect(ingestionRepository.getByID(ingestion.id)).resolves.toMatchObject({
      source: IngestionSource.Nuclei,
      scope: { target: "example.com" },
      createdObservations: 1,
    });
  });

  it("creates an observation and touches its parent finding atomically", async () => {
    const asset = await createAssetRepository(testDb.db).create(
      assetRecord("api.exposurenexus.local"),
    );
    const findingRepository = createFindingPersistenceRepository(testDb.db);
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
      affectedResource: { type: AffectedResourceType.Asset },
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

    await sql`
      create function invalidate_finding_projection() returns trigger as $$
      begin
        new.title = '';
        return new;
      end;
      $$ language plpgsql
    `.execute(testDb.db);
    await sql`
      create trigger invalidate_finding_projection
      before update on finding
      for each row execute function invalidate_finding_projection()
    `.execute(testDb.db);

    await expect(
      observationRepository.createAndTouchFinding({
        findingId: finding.id,
        buildObservation: () => ({
          ...observationInput,
          title: "Must roll back",
          updatedAt: new Date("2026-08-18T10:00:00.000Z"),
        }),
      }),
    ).rejects.toThrow();
    await expect(observationRepository.listByFindingID(finding.id)).resolves.toEqual([
      created?.observation,
    ]);
    await expect(findingRepository.getByID(finding.id)).resolves.toMatchObject({
      title: "Canonical title",
      updatedAt: updateTime,
    });
    await sql`drop trigger invalidate_finding_projection on finding`.execute(testDb.db);
    await sql`drop function invalidate_finding_projection()`.execute(testDb.db);
  });

  it("updates and deletes observations while refreshing the parent projection atomically", async () => {
    const asset = await createAssetRepository(testDb.db).create(
      assetRecord("api.exposurenexus.local"),
    );
    const findingRepository = createFindingPersistenceRepository(testDb.db);
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
        observingSources: [ObservationSource.Manual],
        firstSeen: updateTime,
        lastSeen: updateTime,
        updatedAt: updateTime,
        updatedBy: createdBy,
      },
    });

    const deleted = await observationRepository.deleteAndTouchFinding({
      findingId: finding.id,
      observationId: observation.id,
      updatedAt: new Date("2026-08-18T10:00:00.000Z"),
      updatedBy: createdBy,
    });

    expect(deleted).toMatchObject({
      observation: updated?.observation,
      current: {
        observationCount: 0,
        observingSources: [],
        firstSeen: null,
        lastSeen: null,
        updatedBy: createdBy,
      },
    });
    await expect(findingRepository.getProjectedByID(finding.id)).resolves.toMatchObject({
      status: FindingStatus.Confirmed,
      title: "Canonical title",
      observationCount: 0,
      observingSources: [],
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
    const asset = await createAssetRepository(testDb.db).create(
      assetRecord("api.exposurenexus.local"),
    );
    const findingRepository = createFindingPersistenceRepository(testDb.db);
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
      affectedResource: { type: AffectedResourceType.Asset },
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
        observingSources: [],
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
        observingSources: [ObservationSource.Manual],
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

  it("does not move an observation when either parent or the observation is missing", async () => {
    const asset = await createAssetRepository(testDb.db).create(
      assetRecord("api.exposurenexus.local"),
    );
    const findingRepository = createFindingPersistenceRepository(testDb.db);
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
    await expect(
      observationRepository.moveAndTouchFindings({
        findingId: sourceFinding.id,
        observationId: "2713d833-eb13-4517-ac7c-7761545ed42a",
        targetFindingId: "2713d833-eb13-4517-ac7c-7761545ed42b",
        updatedAt: new Date("2026-08-17T10:00:00.000Z"),
        updatedBy: createdBy,
      }),
    ).resolves.toBeNull();
  });

  it("rolls back the observation relationship and both parent audits when a parent update fails", async () => {
    const asset = await createAssetRepository(testDb.db).create(
      assetRecord("api.exposurenexus.local"),
    );
    const findingRepository = createFindingPersistenceRepository(testDb.db);
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

  it("builds one ordered projection for findings, observations, and catalog links", async () => {
    const asset = await createAssetRepository(testDb.db).create(
      assetRecord("api.exposurenexus.local"),
    );
    const findingRepository = createFindingPersistenceRepository(testDb.db);
    const observationRepository = createObservationRepository(testDb.db);
    const ingestionRepository = createIngestionRepository(testDb.db);
    const vulnerabilityRepository = createVulnerabilityPersistenceRepository(testDb.db);
    const linkRepository = createFindingVulnerabilityRepository(testDb.db);
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
    await linkRepository.create({ findingId: finding.id, vulnerabilityId: cwe.id });
    await linkRepository.create({ findingId: finding.id, vulnerabilityId: cve.id });
    const ingestion = await ingestionRepository.create({
      source: IngestionSource.Nuclei,
      scope: { target: "example.com" },
      createdAt: timestamp,
      createdBy,
    });
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
      affectedResource: { type: AffectedResourceType.Asset },
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
      observingSources: [ObservationSource.Manual, ObservationSource.Nuclei],
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
      observingSources: [],
      firstSeen: null,
      lastSeen: null,
      vulnerabilities: [],
    });
    await expect(findingRepository.countBy("status")).resolves.toEqual({
      [FindingStatus.Active]: 2,
    });
    await expect(findingRepository.getProjectedByID(finding.id)).resolves.toEqual(projectedFinding);
  });

  it("replaces JSON identity values and preserves finding-owned persistence boundaries", async () => {
    const asset = await createAssetRepository(testDb.db).create(
      assetRecord("api.exposurenexus.local"),
    );
    const repository = createFindingPersistenceRepository(testDb.db);
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

  it("enforces link uniqueness and cascades observations and links with finding deletion", async () => {
    const asset = await createAssetRepository(testDb.db).create(
      assetRecord("api.exposurenexus.local"),
    );
    const findingRepository = createFindingPersistenceRepository(testDb.db);
    const observationRepository = createObservationRepository(testDb.db);
    const vulnerabilityRepository = createVulnerabilityPersistenceRepository(testDb.db);
    const linkRepository = createFindingVulnerabilityRepository(testDb.db);
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
      affectedResource: { type: AffectedResourceType.Asset },
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
    await linkRepository.create({ findingId: finding.id, vulnerabilityId: vulnerability.id });
    await expect(
      linkRepository.create({ findingId: finding.id, vulnerabilityId: vulnerability.id }),
    ).rejects.toThrow();
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
      affectedResource: { type: AffectedResourceType.Asset },
      observedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
      updatedBy: createdBy,
    });

    await findingRepository.deleteByID(finding.id);

    await expect(observationRepository.listByFindingID(finding.id)).resolves.toEqual([]);
    await expect(linkRepository.listByFindingID(finding.id)).resolves.toEqual([]);
    await expect(vulnerabilityRepository.getByID(vulnerability.id)).resolves.toEqual(vulnerability);
  });

  it("creates a manual finding, observation, and links atomically", async () => {
    const asset = await createAssetRepository(testDb.db).create(
      assetRecord("api.exposurenexus.local"),
    );
    const findingRepository = createFindingPersistenceRepository(testDb.db);
    const vulnerabilityRepository = createVulnerabilityPersistenceRepository(testDb.db);
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
  });

  it("rolls back the finding and observation when a catalog link fails", async () => {
    const asset = await createAssetRepository(testDb.db).create(
      assetRecord("api.exposurenexus.local"),
    );
    const findingRepository = createFindingPersistenceRepository(testDb.db);
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
