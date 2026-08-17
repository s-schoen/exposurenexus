import { AffectedResourceType } from "@exposurenexus/types/model/affected-resource";
import { AssetEnvironment, AssetLifecycleState, AssetType } from "@exposurenexus/types/model/asset";
import { FindingStatus } from "@exposurenexus/types/model/finding";
import { IngestionSource } from "@exposurenexus/types/model/ingestion";
import { ObservationSource } from "@exposurenexus/types/model/observation";
import { VulnerabilitySeverity, VulnerabilityType } from "@exposurenexus/types/model/vulnerability";
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
      scheme: "https",
      host: "example.com",
      path: "/login",
      port: 443,
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

    expect(importedObservation.affectedResource).toMatchObject({
      reportedUrl: "https://EXAMPLE.com:443/login",
      port: 443,
    });
    await expect(observationRepository.listByFindingID(finding.id)).resolves.toEqual([
      manualObservation,
      importedObservation,
    ]);
    await expect(ingestionRepository.getByID(ingestion.id)).resolves.toMatchObject({
      source: IngestionSource.Nuclei,
      scope: { target: "example.com" },
      createdObservations: 1,
    });
  });

  it("builds one ordered projection for findings, observations, and catalog links", async () => {
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
    await observationRepository.create({
      findingId: finding.id,
      ingestionId: null,
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
