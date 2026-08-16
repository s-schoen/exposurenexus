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
});
