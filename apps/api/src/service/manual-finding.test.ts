import { AffectedResourceType } from "@exposurenexus/types/model/affected-resource";
import {
  FindingStatus,
  type CreateManualFinding,
  type Finding,
} from "@exposurenexus/types/model/finding";
import { ObservationSource, type Observation } from "@exposurenexus/types/model/observation";
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
  const findingRepository = {
    createManual: vi.fn(),
    listProjected: vi.fn(),
    getProjectedByID: vi.fn(),
    updateByID: vi.fn(),
    deleteByID: vi.fn(),
    linkVulnerability: vi.fn(),
    unlinkVulnerability: vi.fn(),
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
  const projection: Finding = {
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
    firstSeen: new Date("2026-02-03T04:05:06.000Z"),
    lastSeen: new Date("2026-02-03T04:05:06.000Z"),
    createdAt: new Date("2026-02-03T04:05:06.000Z"),
    updatedAt: new Date("2026-02-03T04:05:06.000Z"),
    createdBy: user.id,
    updatedBy: user.id,
  };
  const initialObservation: Observation = {
    id: "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d",
    findingId,
    ingestionId: null,
    source: ObservationSource.Manual,
    title: projection.title,
    description: null,
    evidence: "GET /admin returned 200",
    remediation: "Require authentication",
    severity: projection.severity,
    weakness: projection.weakness,
    affectedResource: { type: AffectedResourceType.Unspecified },
    observedAt: projection.createdAt,
    createdAt: projection.createdAt,
    updatedAt: projection.createdAt,
    createdBy: user.id,
    updatedBy: user.id,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    domainEvents.clear();
    assetService.getByID.mockResolvedValue({ id: assetId });
    userProfileService.getByID.mockResolvedValue(null);
    vulnerabilityService.getByID.mockResolvedValue(vulnerability);
    findingRepository.createManual.mockResolvedValue({
      finding: projection,
      observation: initialObservation,
      links: [],
      projection,
    });
  });

  function createService() {
    return createFindingService({
      findingRepository,
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

    expect(findingRepository.createManual).toHaveBeenCalledWith({
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
    expect(domainEvents.subjects()).toEqual(["finding.created", "observation.created"]);
    expect(domainEvents.events[0]).toMatchObject({
      subject: "finding.created",
      actor: user.id,
      correlationId: "manual-create-request",
      data: { finding: projection },
    });
    expect(domainEvents.events[1]).toMatchObject({
      subject: "observation.created",
      actor: user.id,
      correlationId: "manual-create-request",
      data: { observation: initialObservation },
    });
    expect(findingRepository.getProjectedByID).not.toHaveBeenCalled();
  });

  it("does not emit an event when the atomic persistence operation fails", async () => {
    findingRepository.createManual.mockRejectedValue(new Error("observation write failed"));

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
