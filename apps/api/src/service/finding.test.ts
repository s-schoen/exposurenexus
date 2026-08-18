import { AffectedResourceType } from "@exposurenexus/types/model/affected-resource";
import { FindingStatus, type FindingProjection } from "@exposurenexus/types/model/finding";
import { ObservationSource } from "@exposurenexus/types/model/observation";
import { VulnerabilitySeverity, VulnerabilityType } from "@exposurenexus/types/model/vulnerability";
import { pino } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestUser } from "../test/app.js";
import { createDomainEventCollector } from "../test/eventbus.js";
import { createFindingService } from "./finding.js";

import type { ApplicationError } from "./application-error.js";

describe("finding service", () => {
  const user = createTestUser();
  const assigneeId = "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d";
  const logger = pino({ enabled: false });
  const findingPersistenceRepository = {
    createManual: vi.fn(),
    listProjected: vi.fn(),
    getProjectedByID: vi.fn(),
    updateByID: vi.fn(),
    deleteByID: vi.fn(),
  };
  const findingVulnerabilityRepository = {
    listByFindingID: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    linkAndTouchFinding: vi.fn(),
    unlinkAndTouchFinding: vi.fn(),
  };
  const observationRepository = {
    listByFindingID: vi.fn(),
    createAndTouchFinding: vi.fn(),
    updateAndTouchFinding: vi.fn(),
    deleteAndTouchFinding: vi.fn(),
    moveAndTouchFindings: vi.fn(),
  };
  const vulnerabilityService = { getByID: vi.fn() };
  const assetService = { getByID: vi.fn() };
  const userProfileService = { getByID: vi.fn() };
  const domainEvents = createDomainEventCollector();
  const vulnerability = {
    id: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
    type: VulnerabilityType.Custom,
    identifier: "exposed-admin-endpoint",
    title: "Exposed Admin Endpoint",
    severity: VulnerabilitySeverity.High,
    description: "Administrative interface is reachable externally",
    metadata: { cwe: 284 },
    createdBy: user.id,
    updatedBy: user.id,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  const baseProjection: FindingProjection = {
    id: "2713d833-eb13-4517-ac7c-7761545ed42a",
    assetId: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
    title: "Exposed admin endpoint",
    severity: VulnerabilitySeverity.High,
    status: FindingStatus.Active,
    assigneeId: null,
    dueDate: null,
    mitigation: "Restrict access to trusted networks",
    weakness: { identifiers: { cwe: ["CWE-200"], nuclei: ["admin-panel"] } },
    affectedResource: {
      type: AffectedResourceType.WebEndpoint,
      scheme: "https",
      host: "example.com",
      port: 443,
      path: "/admin",
    },
    vulnerabilities: [vulnerability],
    observationCount: 2,
    observingSources: [ObservationSource.Manual, ObservationSource.Nuclei],
    firstSeen: new Date("2026-01-02T00:00:00.000Z"),
    lastSeen: new Date("2026-01-03T00:00:00.000Z"),
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    createdBy: user.id,
    updatedBy: user.id,
  };

  function createService() {
    return createFindingService({
      findingPersistenceRepository,
      findingVulnerabilityRepository,
      observationRepository,
      assetService,
      userProfileService,
      vulnerabilityService,
      domainEventEmitter: domainEvents.emitter,
      logger,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    domainEvents.clear();
  });

  it("lists final finding projections without catalog lookups", async () => {
    findingPersistenceRepository.listProjected.mockResolvedValue([baseProjection]);

    await expect(createService().listAll()).resolves.toEqual([baseProjection]);
    expect(findingPersistenceRepository.listProjected).toHaveBeenCalledOnce();
    expect(vulnerabilityService.getByID).not.toHaveBeenCalled();
  });

  it("gets a final finding projection by id", async () => {
    findingPersistenceRepository.getProjectedByID.mockResolvedValue(baseProjection);

    await expect(createService().getByID(baseProjection.id)).resolves.toBe(baseProjection);
    expect(findingPersistenceRepository.getProjectedByID).toHaveBeenCalledWith(baseProjection.id);
  });

  it("maps projection lookup failures to an application error", async () => {
    findingPersistenceRepository.getProjectedByID.mockRejectedValue(new Error("db offline"));

    await expect(createService().getByID(baseProjection.id)).rejects.toMatchObject({
      code: "finding.get_failed",
      kind: "unexpected",
      details: { findingId: baseProjection.id },
    } satisfies Partial<ApplicationError>);
  });

  it("corrects finding-owned fields and emits complete projection snapshots", async () => {
    const now = new Date("2026-03-04T05:06:07.000Z");
    const correction = {
      title: "Corrected admin endpoint",
      weakness: { identifiers: { cwe: ["CWE-89"] } },
      affectedResource: {
        type: AffectedResourceType.SourceCode as const,
        repository: "github.com/example/repository",
        file: "src/query.ts",
      },
    };
    const current = { ...baseProjection, ...correction, updatedAt: now, updatedBy: user.id };
    vi.useFakeTimers();
    vi.setSystemTime(now);
    findingPersistenceRepository.getProjectedByID
      .mockResolvedValueOnce(baseProjection)
      .mockResolvedValueOnce(current);
    findingPersistenceRepository.updateByID.mockResolvedValue({ id: baseProjection.id });

    await expect(
      createService().updateByID({
        id: baseProjection.id,
        finding: correction,
        user,
        eventContext: { actor: user.id, correlationId: "finding-correction" },
      }),
    ).resolves.toEqual(current);

    expect(findingPersistenceRepository.updateByID).toHaveBeenCalledWith(baseProjection.id, {
      ...correction,
      updatedAt: now,
      updatedBy: user.id,
    });
    expect(domainEvents.events[0]).toMatchObject({
      subject: "finding.updated",
      actor: user.id,
      correlationId: "finding-correction",
      data: { previous: baseProjection, current },
    });
  });

  it("normalizes and clears due dates from partial updates", async () => {
    const dueDate = new Date("2026-05-06T18:30:00.000Z");
    const normalizedDueDate = new Date("2026-05-06T00:00:00.000Z");
    const dated = { ...baseProjection, dueDate: normalizedDueDate };
    const cleared = { ...baseProjection, dueDate: null };
    findingPersistenceRepository.getProjectedByID
      .mockResolvedValueOnce(baseProjection)
      .mockResolvedValueOnce(dated)
      .mockResolvedValueOnce(dated)
      .mockResolvedValueOnce(cleared);
    findingPersistenceRepository.updateByID.mockResolvedValue({ id: baseProjection.id });

    await expect(
      createService().updateByID({ id: baseProjection.id, finding: { dueDate }, user }),
    ).resolves.toEqual(dated);
    expect(findingPersistenceRepository.updateByID).toHaveBeenLastCalledWith(
      baseProjection.id,
      expect.objectContaining({ dueDate: normalizedDueDate }),
    );

    await expect(
      createService().updateByID({ id: baseProjection.id, finding: { dueDate: null }, user }),
    ).resolves.toEqual(cleared);
    expect(findingPersistenceRepository.updateByID).toHaveBeenLastCalledWith(
      baseProjection.id,
      expect.objectContaining({ dueDate: null }),
    );
  });

  it("rejects an unknown assignee before persisting", async () => {
    findingPersistenceRepository.getProjectedByID.mockResolvedValue(baseProjection);
    userProfileService.getByID.mockResolvedValue(null);

    await expect(
      createService().updateByID({
        id: baseProjection.id,
        finding: { assigneeId },
        user,
      }),
    ).rejects.toMatchObject({
      code: "finding.assignee_unknown",
      kind: "validation",
      details: { assigneeId, findingId: baseProjection.id },
    } satisfies Partial<ApplicationError>);
    expect(findingPersistenceRepository.updateByID).not.toHaveBeenCalled();
  });

  it("links and unlinks catalog vulnerabilities", async () => {
    const link = { findingId: baseProjection.id, vulnerabilityId: vulnerability.id };
    findingPersistenceRepository.getProjectedByID.mockResolvedValue(baseProjection);
    vulnerabilityService.getByID.mockResolvedValue(vulnerability);
    findingVulnerabilityRepository.linkAndTouchFinding.mockResolvedValue({ link, changed: true });
    findingVulnerabilityRepository.unlinkAndTouchFinding.mockResolvedValue({ link, changed: true });

    await expect(
      createService().linkVulnerability({
        findingId: baseProjection.id,
        vulnerabilityId: vulnerability.id,
        user,
      }),
    ).resolves.toEqual({ finding: baseProjection, changed: true });
    expect(domainEvents.subjects()).toEqual(["finding.vulnerability.linked"]);

    domainEvents.clear();
    await expect(
      createService().unlinkVulnerability({
        findingId: baseProjection.id,
        vulnerabilityId: vulnerability.id,
        user,
      }),
    ).resolves.toEqual({ finding: baseProjection, changed: true });
    expect(domainEvents.subjects()).toEqual(["finding.vulnerability.unlinked"]);
  });

  it("deletes a projected finding and emits its final snapshot", async () => {
    findingPersistenceRepository.getProjectedByID.mockResolvedValue(baseProjection);
    findingPersistenceRepository.deleteByID.mockResolvedValue({ id: baseProjection.id });

    await expect(
      createService().deleteByID(baseProjection.id, {
        actor: user.id,
        correlationId: "findings-delete-request",
      }),
    ).resolves.toBe(baseProjection);
    expect(domainEvents.events[0]).toMatchObject({
      subject: "finding.deleted",
      actor: user.id,
      correlationId: "findings-delete-request",
      data: { finding: baseProjection },
    });
  });

  it("does not delete when the projected finding is missing", async () => {
    findingPersistenceRepository.getProjectedByID.mockResolvedValue(null);

    await expect(createService().deleteByID(baseProjection.id)).resolves.toBeNull();
    expect(findingPersistenceRepository.deleteByID).not.toHaveBeenCalled();
    expect(domainEvents.subjects()).toEqual([]);
  });
});
