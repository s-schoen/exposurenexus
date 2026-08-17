import { AffectedResourceType } from "@exposurenexus/types/model/affected-resource";
import { FindingStatus, type FindingProjection } from "@exposurenexus/types/model/finding";
import { ObservationSource, type Observation } from "@exposurenexus/types/model/observation";
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability";
import { pino } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestUser } from "../test/app.js";
import { createDomainEventCollector } from "../test/eventbus.js";
import { createFindingService } from "./finding.js";

const user = createTestUser();
const findingId = "2713d833-eb13-4517-ac7c-7761545ed42a";
const observationId = "9d7acdd0-fad1-46c9-8218-1793f421f0fe";
const oldTime = new Date("2026-08-16T10:00:00.000Z");
const now = new Date("2026-08-17T10:00:00.000Z");

const previousFinding: FindingProjection = {
  id: findingId,
  assetId: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
  title: "Canonical title",
  severity: VulnerabilitySeverity.High,
  status: FindingStatus.Active,
  assigneeId: null,
  dueDate: null,
  mitigation: null,
  weakness: { identifiers: { cwe: ["CWE-200"] } },
  affectedResource: { type: AffectedResourceType.Unspecified },
  vulnerabilities: [],
  observationCount: 1,
  observingSources: [ObservationSource.Nuclei],
  firstSeen: oldTime,
  lastSeen: oldTime,
  createdAt: oldTime,
  updatedAt: oldTime,
  createdBy: user.id,
  updatedBy: user.id,
};

describe("nested manual observations", () => {
  const findingRepository = {
    list: vi.fn(),
    getByID: vi.fn(),
    getByFingerprint: vi.fn(),
    create: vi.fn(),
    updateByID: vi.fn(),
    deleteByID: vi.fn(),
    countBy: vi.fn(),
  };
  const findingPersistenceRepository = {
    listProjected: vi.fn(),
    getProjectedByID: vi.fn(),
    updateByID: vi.fn(),
    deleteByID: vi.fn(),
  };
  const observationRepository = {
    listByFindingID: vi.fn(),
    createAndTouchFinding: vi.fn(),
  };
  const domainEvents = createDomainEventCollector();

  beforeEach(() => {
    vi.clearAllMocks();
    domainEvents.clear();
    vi.useRealTimers();
    findingPersistenceRepository.getProjectedByID.mockResolvedValue(previousFinding);
  });

  function createService() {
    return createFindingService({
      findingRepository,
      findingPersistenceRepository,
      observationRepository,
      assetService: { getByID: vi.fn() },
      userProfileService: { getByID: vi.fn() },
      vulnerabilityService: { getByID: vi.fn() },
      domainEventEmitter: domainEvents.emitter,
      logger: pino({ enabled: false }),
    });
  }

  it("lists only observations owned by an existing parent finding", async () => {
    const observations = [{ id: observationId }] as Observation[];
    observationRepository.listByFindingID.mockResolvedValue(observations);

    await expect(createService().listObservations(findingId)).resolves.toBe(observations);
    expect(observationRepository.listByFindingID).toHaveBeenCalledWith(findingId);

    findingPersistenceRepository.getProjectedByID.mockResolvedValueOnce(null);
    await expect(createService().listObservations(findingId)).resolves.toBeNull();
    expect(observationRepository.listByFindingID).toHaveBeenCalledOnce();
  });

  it("defaults from one timestamp and parent snapshot without changing canonical identity", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const createdObservation = {
      id: observationId,
      findingId,
      ingestionId: null,
      source: ObservationSource.Manual,
      title: previousFinding.title,
      description: null,
      evidence: "manual evidence",
      remediation: null,
      severity: previousFinding.severity,
      weakness: previousFinding.weakness,
      affectedResource: previousFinding.affectedResource,
      observedAt: now,
      createdAt: now,
      updatedAt: now,
      createdBy: user.id,
      updatedBy: user.id,
    } satisfies Observation;
    const currentFinding = {
      ...previousFinding,
      observationCount: 2,
      observingSources: [ObservationSource.Manual, ObservationSource.Nuclei],
      lastSeen: now,
      updatedAt: now,
    } satisfies FindingProjection;
    const lockedPreviousFinding = {
      ...previousFinding,
      title: "Locked canonical title",
      severity: VulnerabilitySeverity.Medium,
    } satisfies FindingProjection;
    const createdFromLockedFinding = {
      ...createdObservation,
      title: lockedPreviousFinding.title,
      severity: lockedPreviousFinding.severity,
    } satisfies Observation;
    observationRepository.createAndTouchFinding.mockImplementation(async (input) => ({
      observation: { id: observationId, ...input.buildObservation(lockedPreviousFinding) },
      previous: lockedPreviousFinding,
      current: currentFinding,
    }));

    await expect(
      createService().createManualObservation({
        findingId,
        observation: { evidence: "manual evidence" },
        user,
        eventContext: { actor: user.id, correlationId: "request-08" },
      }),
    ).resolves.toEqual({ observation: createdFromLockedFinding, finding: currentFinding });

    expect(observationRepository.createAndTouchFinding).toHaveBeenCalledWith({
      findingId,
      buildObservation: expect.any(Function),
    });
    expect(findingPersistenceRepository.getProjectedByID).not.toHaveBeenCalled();
    expect(domainEvents.subjects()).toEqual(["observation.created", "finding.updated"]);
    expect(domainEvents.events).toMatchObject([
      {
        data: { observation: createdFromLockedFinding },
        actor: user.id,
        correlationId: "request-08",
      },
      {
        data: { previous: lockedPreviousFinding, current: currentFinding },
        actor: user.id,
        correlationId: "request-08",
      },
    ]);
    expect(createdFromLockedFinding).toMatchObject({
      title: "Locked canonical title",
      severity: VulnerabilitySeverity.Medium,
      weakness: lockedPreviousFinding.weakness,
      affectedResource: lockedPreviousFinding.affectedResource,
      observedAt: now,
    });
  });

  it("keeps supplied observation snapshots observation-owned", async () => {
    const supplied = {
      title: "Source title",
      severity: VulnerabilitySeverity.Low,
      weakness: { identifiers: { custom: ["manual-check"] } },
      affectedResource: { type: AffectedResourceType.Asset as const },
      observedAt: oldTime,
    };
    observationRepository.createAndTouchFinding.mockImplementation(async (input) => ({
      observation: { id: observationId, ...input.buildObservation(previousFinding) },
      previous: previousFinding,
      current: { ...previousFinding, updatedAt: now },
    }));

    await createService().createManualObservation({ findingId, observation: supplied, user });

    const input = observationRepository.createAndTouchFinding.mock.calls[0]?.[0];
    expect(input?.buildObservation(previousFinding)).toMatchObject(supplied);
    expect(findingPersistenceRepository.updateByID).not.toHaveBeenCalled();
  });

  it("returns null when the transaction reports that the locked parent does not exist", async () => {
    observationRepository.createAndTouchFinding.mockResolvedValue(null);

    await expect(
      createService().createManualObservation({ findingId, observation: {}, user }),
    ).resolves.toBeNull();
    expect(observationRepository.createAndTouchFinding).toHaveBeenCalledOnce();
    expect(findingPersistenceRepository.getProjectedByID).not.toHaveBeenCalled();
    expect(domainEvents.subjects()).toEqual([]);
  });

  it("emits no events when the transactional mutation rejects", async () => {
    observationRepository.createAndTouchFinding.mockRejectedValue(
      new Error("current projection failed"),
    );

    await expect(
      createService().createManualObservation({ findingId, observation: {}, user }),
    ).rejects.toMatchObject({ code: "observation.create_failed" });

    expect(domainEvents.subjects()).toEqual([]);
  });

  it("emits observation then finding events only after the transaction resolves", async () => {
    const observation = {
      id: observationId,
      findingId,
      ingestionId: null,
      source: ObservationSource.Manual,
      title: previousFinding.title,
      description: null,
      evidence: null,
      remediation: null,
      severity: previousFinding.severity,
      weakness: previousFinding.weakness,
      affectedResource: previousFinding.affectedResource,
      observedAt: now,
      createdAt: now,
      updatedAt: now,
      createdBy: user.id,
      updatedBy: user.id,
    } satisfies Observation;
    const current = { ...previousFinding, observationCount: 2 };
    let resolveTransaction!: () => void;
    observationRepository.createAndTouchFinding.mockReturnValue(
      new Promise((resolve) => {
        resolveTransaction = () => resolve({ observation, previous: previousFinding, current });
      }),
    );

    const creation = createService().createManualObservation({
      findingId,
      observation: {},
      user,
    });

    expect(domainEvents.subjects()).toEqual([]);
    resolveTransaction();
    await creation;
    expect(domainEvents.subjects()).toEqual(["observation.created", "finding.updated"]);
  });
});
