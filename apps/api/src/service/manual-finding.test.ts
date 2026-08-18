import { AffectedResourceType } from "@exposurenexus/types/model/affected-resource";
import {
  FindingStatus,
  type CreateManualFinding,
  type FindingProjection,
} from "@exposurenexus/types/model/finding";
import { ObservationSource } from "@exposurenexus/types/model/observation";
import { VulnerabilitySeverity, VulnerabilityType } from "@exposurenexus/types/model/vulnerability";
import { pino } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestUser } from "../test/app.js";
import { createDomainEventCollector } from "../test/eventbus.js";
import { createFindingService } from "./finding.js";

const user = createTestUser();
const assetId = "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c";
const findingId = "2713d833-eb13-4517-ac7c-7761545ed42a";
const vulnerabilityId = "9d7acdd0-fad1-46c9-8218-1793f421f0fe";

describe("manual finding creation", () => {
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
  const assetService = {
    getByID: vi.fn(),
  };
  const userProfileService = {
    getByID: vi.fn(),
  };
  const vulnerabilityService = {
    getByID: vi.fn(),
  };
  const domainEvents = createDomainEventCollector();
  const vulnerability = {
    id: vulnerabilityId,
    type: VulnerabilityType.Custom,
    identifier: "exposed-admin-panel",
    title: "Exposed admin panel",
    description: null,
    severity: VulnerabilitySeverity.High,
    metadata: null,
    createdBy: user.id,
    updatedBy: user.id,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  const projection: FindingProjection = {
    id: findingId,
    assetId,
    title: "Exposed admin panel",
    severity: VulnerabilitySeverity.High,
    status: FindingStatus.Active,
    assigneeId: null,
    dueDate: null,
    mitigation: "Restrict access",
    weakness: { identifiers: {} },
    affectedResource: { type: AffectedResourceType.Unspecified },
    vulnerabilities: [vulnerability],
    observationCount: 1,
    observingSources: [ObservationSource.Manual],
    firstSeen: new Date("2026-02-03T04:05:06.000Z"),
    lastSeen: new Date("2026-02-03T04:05:06.000Z"),
    createdAt: new Date("2026-02-03T04:05:06.000Z"),
    updatedAt: new Date("2026-02-03T04:05:06.000Z"),
    createdBy: user.id,
    updatedBy: user.id,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    domainEvents.clear();
    assetService.getByID.mockResolvedValue({ id: assetId });
    userProfileService.getByID.mockResolvedValue(null);
    vulnerabilityService.getByID.mockResolvedValue(vulnerability);
    findingPersistenceRepository.createManual.mockResolvedValue({ finding: { id: findingId } });
    findingPersistenceRepository.getProjectedByID.mockResolvedValue(projection);
  });

  function createService() {
    return createFindingService({
      findingPersistenceRepository,
      findingVulnerabilityRepository,
      observationRepository,
      assetService,
      userProfileService,
      vulnerabilityService,
      domainEventEmitter: domainEvents.emitter,
      logger: pino({ enabled: false }),
    });
  }

  it("creates the finding, initial manual observation, and catalog links with one audit timestamp", async () => {
    const now = new Date("2026-02-03T04:05:06.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const finding = {
      assetId,
      title: "Exposed admin panel",
      severity: VulnerabilitySeverity.High,
      status: FindingStatus.Active,
      assigneeId: null,
      dueDate: null,
      mitigation: "Restrict access",
      weakness: { identifiers: {} },
      affectedResource: { type: AffectedResourceType.Unspecified },
      vulnerabilityIds: [vulnerabilityId],
      observation: {
        evidence: "GET /admin returned 200",
        remediation: "Require authentication",
      },
    } satisfies CreateManualFinding;

    await expect(
      createService().createManual({
        finding,
        user,
        eventContext: { actor: user.id, correlationId: "manual-create-request" },
      }),
    ).resolves.toBe(projection);

    expect(findingPersistenceRepository.createManual).toHaveBeenCalledWith({
      finding: {
        assetId,
        title: finding.title,
        severity: finding.severity,
        status: finding.status,
        assigneeId: null,
        dueDate: null,
        mitigation: finding.mitigation,
        weakness: finding.weakness,
        affectedResource: finding.affectedResource,
        createdAt: now,
        updatedAt: now,
        createdBy: user.id,
        updatedBy: user.id,
      },
      observation: {
        ingestionId: null,
        source: ObservationSource.Manual,
        title: finding.title,
        description: null,
        evidence: "GET /admin returned 200",
        remediation: "Require authentication",
        severity: finding.severity,
        weakness: finding.weakness,
        affectedResource: finding.affectedResource,
        observedAt: now,
        createdAt: now,
        updatedAt: now,
        createdBy: user.id,
        updatedBy: user.id,
      },
      vulnerabilityIds: [vulnerabilityId],
    });
    expect(domainEvents.subjects()).toEqual(["finding.created"]);
    expect(domainEvents.events[0]).toMatchObject({
      subject: "finding.created",
      actor: user.id,
      correlationId: "manual-create-request",
      data: { finding: projection },
    });
  });

  it("does not emit an event when the atomic persistence operation fails", async () => {
    findingPersistenceRepository.createManual.mockRejectedValue(
      new Error("observation write failed"),
    );

    await expect(
      createService().createManual({
        finding: {
          assetId,
          title: "Exposed admin panel",
          severity: VulnerabilitySeverity.High,
          status: FindingStatus.Active,
          assigneeId: null,
          dueDate: null,
          mitigation: null,
          weakness: { identifiers: {} },
          affectedResource: { type: AffectedResourceType.Unspecified },
          vulnerabilityIds: [],
        },
        user,
      }),
    ).rejects.toMatchObject({ code: "finding.manual_create_failed" });

    expect(domainEvents.subjects()).toEqual([]);
  });
});
